/**
 * Google Play Store Billing via RevenueCat
 *
 * Premium status is EXCLUSIVELY determined by Google Play Store.
 * No mock, no local override — only Play Store billing counts.
 *
 * LICENSE TESTING:
 * 1. Add test Gmail accounts in Google Play Console → Setup → License testing
 * 2. Create subscription product "sangi_pos_premium_monthly" in Play Console
 * 3. Set up RevenueCat project with entitlement "premium"
 * 4. Replace REVENUECAT_API_KEY below with your actual key
 * 5. Build APK, upload to internal testing track, install on device with test account
 */

import { Capacitor } from "@capacitor/core";

// ── Replace with your actual RevenueCat Public API Key ──
const REVENUECAT_API_KEY = "goog_ouHsDkkGRTlcFuDbXFbNxyDNVhc";
const ENTITLEMENT_ID = "sangi_pro";

export const PREMIUM_PRODUCT_ID = "sangi_pro:sangipro";

export type PremiumStatus = {
  isPremium: boolean;
  expiresAt?: number;
  source: "play_store" | "none";
};

let _initialized = false;

/**
 * Initialize RevenueCat SDK. Call once at app startup.
 */
export async function initBilling(): Promise<void> {
  if (_initialized || !Capacitor.isNativePlatform()) return;
  if (REVENUECAT_API_KEY === "YOUR_REVENUECAT_API_KEY_HERE") {
    console.warn("[PlayBilling] RevenueCat API key not set. Billing disabled.");
    return;
  }

  try {
    const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    _initialized = true;
    console.log("[PlayBilling] RevenueCat initialized");
  } catch (e) {
    console.warn("[PlayBilling] Init failed:", e);
  }
}

/**
 * Check premium status from Play Store via RevenueCat.
 */
export async function checkPlayStorePremium(): Promise<PremiumStatus> {
  if (!Capacitor.isNativePlatform()) {
    return { isPremium: false, source: "none" };
  }

  if (!_initialized) {
    await initBilling();
  }

  if (!_initialized) {
    // RevenueCat not available — key not set or init failed
    return { isPremium: false, source: "none" };
  }

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const info = await Purchases.getCustomerInfo();
    // ── DEBUG: log full entitlements so we can see what RevenueCat returns ──
    console.log("[PlayBilling] Full customerInfo.entitlements:", JSON.stringify(info.customerInfo.entitlements));
    console.log("[PlayBilling] Active entitlements keys:", Object.keys(info.customerInfo.entitlements.active || {}));
    console.log("[PlayBilling] Looking for entitlement ID:", ENTITLEMENT_ID);
    const entitlement = info.customerInfo.entitlements.active[ENTITLEMENT_ID];
    console.log("[PlayBilling] Matched entitlement:", JSON.stringify(entitlement));
    
    // Primary check: exact entitlement match
    let isPremium = entitlement !== undefined;
    
    // Fallback: if ANY active entitlement exists, treat as premium
    if (!isPremium) {
      const activeKeys = Object.keys(info.customerInfo.entitlements.active || {});
      if (activeKeys.length > 0) {
        console.log("[PlayBilling] Exact entitlement not found, but found active entitlements:", activeKeys);
        isPremium = true;
      }
    }
    
    // Additional fallback: check activeSubscriptions
    if (!isPremium) {
      const subs = (info.customerInfo as any).activeSubscriptions;
      if (subs && subs.length > 0) {
        console.log("[PlayBilling] Found active subscriptions:", subs);
        isPremium = true;
      }
    }
    
    console.log("[PlayBilling] isPremium result:", isPremium);
    const expiry = entitlement?.expirationDate;
    return {
      isPremium,
      expiresAt: expiry ? new Date(expiry).getTime() : undefined,
      source: "play_store",
    };
  } catch (e) {
    console.warn("[PlayBilling] Check failed:", e);
    return { isPremium: false, source: "none" };
  }
}

export type SubscriptionPackage = {
  id: string;
  label: string;
  priceString: string;
  packageType: string;
  /** raw RevenueCat package object for purchasing */
  _raw: any;
};

/**
 * Get the localized price string for the premium subscription.
 */
export async function getSubscriptionPrice(): Promise<string | null> {
  const pkgs = await getAvailablePackages();
  return pkgs[0]?.priceString ?? null;
}

/**
 * Get all available subscription packages (monthly, yearly, etc.)
 */
export async function getAvailablePackages(): Promise<SubscriptionPackage[]> {
  if (!Capacitor.isNativePlatform()) return [];
  if (!_initialized) await initBilling();
  if (!_initialized) return [];

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    return packages.map((pkg: any) => ({
      id: pkg.identifier,
      label: getPackageLabel(pkg.packageType),
      priceString: pkg.product?.priceString ?? "",
      packageType: pkg.packageType,
      _raw: pkg,
    }));
  } catch {
    return [];
  }
}

function getPackageLabel(type: string): string {
  switch (type) {
    case "MONTHLY": return "Monthly";
    case "ANNUAL": return "Yearly";
    case "TWO_MONTH": return "2 Months";
    case "THREE_MONTH": return "3 Months";
    case "SIX_MONTH": return "6 Months";
    case "WEEKLY": return "Weekly";
    case "LIFETIME": return "Lifetime";
    default: return type;
  }
}

/**
 * Launch the Play Store in-app purchase flow for premium subscription.
 * Returns true if purchase was successful.
 */
export async function purchasePremium(packageToPurchase?: SubscriptionPackage): Promise<boolean> {
  const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=app.lovable.a89517294eb14219b1dd14af0464d470`;

  if (!Capacitor.isNativePlatform()) {
    window.open(PLAY_STORE_URL, "_blank");
    return false;
  }

  if (!_initialized) {
    await initBilling();
  }

  if (!_initialized) {
    console.warn("[PlayBilling] Not initialized, opening Play Store as fallback");
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: PLAY_STORE_URL });
    } catch (browserErr) {
      console.error("[PlayBilling] Browser fallback failed:", browserErr);
      try {
        window.open(`market://details?id=app.lovable.a89517294eb14219b1dd14af0464d470`, "_system");
      } catch {}
    }
    throw new Error("Billing not available. Please update the app from Play Store and try again.");
  }

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    let pkg: any;

    if (packageToPurchase) {
      pkg = packageToPurchase._raw;
    } else {
      console.log("[PlayBilling] Fetching offerings...");
      const offerings = await Purchases.getOfferings();
      pkg = offerings.current?.availablePackages?.[0];
    }

    if (!pkg) {
      throw new Error("No subscription packages found. Please try again later or contact support.");
    }
    console.log("[PlayBilling] Purchasing package:", JSON.stringify(pkg));
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    const success = result.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    console.log("[PlayBilling] Purchase result, premium:", success);
    if (success) {
      const { setPremiumCache } = await import("./licensing-db");
      await setPremiumCache(true);
    }
    return success;
  } catch (e: any) {
    console.error("[PlayBilling] Purchase error:", JSON.stringify(e), e?.message, e?.code);
    if (e?.userCancelled || e?.code === "1" || e?.message?.includes("cancelled")) return false;
    throw new Error(e?.message || "Purchase failed. Please check your internet connection and try again.");
  }
}

/**
 * Restore purchase from Play Store.
 * Returns true if a valid premium subscription was found.
 */
export async function restorePlayStorePurchase(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  if (!_initialized) {
    await initBilling();
  }
  if (!_initialized) return false;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const info = await Purchases.restorePurchases();
    console.log("[PlayBilling] Restore - active entitlements:", JSON.stringify(info.customerInfo.entitlements.active));
    console.log("[PlayBilling] Restore - all entitlements:", JSON.stringify(info.customerInfo.entitlements));
    
    // Check exact entitlement
    let success = info.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    
    // Fallback: any active entitlement
    if (!success) {
      const activeKeys = Object.keys(info.customerInfo.entitlements.active || {});
      if (activeKeys.length > 0) {
        console.log("[PlayBilling] Restore - found active entitlements:", activeKeys);
        success = true;
      }
    }
    
    // Fallback: active subscriptions
    if (!success) {
      const subs = (info.customerInfo as any).activeSubscriptions;
      if (subs && subs.length > 0) {
        console.log("[PlayBilling] Restore - found active subscriptions:", subs);
        success = true;
      }
    }
    
    console.log("[PlayBilling] Restore result:", success);
    if (success) {
      const { setPremiumCache } = await import("./licensing-db");
      await setPremiumCache(true);
    }
    return success;
  } catch (e) {
    console.error("[PlayBilling] Restore error:", e);
    return false;
  }
}
