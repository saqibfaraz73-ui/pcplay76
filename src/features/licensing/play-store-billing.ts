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
const ENTITLEMENT_ID = "premium";

export const PREMIUM_PRODUCT_ID = "sangi_pos_premium_monthly";

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
    const isPremium = entitlement !== undefined;
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

/**
 * Get the localized price string for the premium subscription.
 */
export async function getSubscriptionPrice(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  if (!_initialized) await initBilling();
  if (!_initialized) return null;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages?.[0];
    return pkg?.product?.priceString ?? null;
  } catch {
    return null;
  }
}

/**
 * Launch the Play Store in-app purchase flow for premium subscription.
 * Returns true if purchase was successful.
 */
export async function purchasePremium(): Promise<boolean> {
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
      // Last resort: try App Store intent
      try {
        window.open(`market://details?id=app.lovable.a89517294eb14219b1dd14af0464d470`, "_system");
      } catch {}
    }
    throw new Error("Billing not available. Please update the app from Play Store and try again.");
  }

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    console.log("[PlayBilling] Fetching offerings...");
    const offerings = await Purchases.getOfferings();
    console.log("[PlayBilling] Offerings:", JSON.stringify(offerings));
    const pkg = offerings.current?.availablePackages?.[0];
    if (!pkg) {
      throw new Error("No subscription packages found. Please try again later or contact support.");
    }
    console.log("[PlayBilling] Purchasing package:", JSON.stringify(pkg));
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    const success = result.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    console.log("[PlayBilling] Purchase result, premium:", success);
    if (success) {
      // Immediately update the cached premium status
      const { setPremiumCache } = await import("./licensing-db");
      setPremiumCache(true);
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
    const success = info.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    if (success) {
      const { setPremiumCache } = await import("./licensing-db");
      setPremiumCache(true);
    }
    return success;
  } catch {
    return false;
  }
}
