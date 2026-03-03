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
const REVENUECAT_API_KEY = "test_oaWsKcJYxeiYLuqGinCfTUCmbjG";
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
    const entitlement = info.customerInfo.entitlements.active[ENTITLEMENT_ID];
    const isPremium = entitlement !== undefined;
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
 * Launch the Play Store in-app purchase flow for premium subscription.
 * Returns true if purchase was successful.
 */
export async function purchasePremium(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    window.open(
      `https://play.google.com/store/apps/details?id=app.lovable.a89517294eb14219b1dd14af0464d470`,
      "_blank"
    );
    return false;
  }

  if (!_initialized) {
    await initBilling();
  }

  if (!_initialized) {
    // Fallback: open Play Store listing
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({
        url: `https://play.google.com/store/apps/details?id=app.lovable.a89517294eb14219b1dd14af0464d470`,
      });
    } catch {}
    return false;
  }

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages?.[0];
    if (!pkg) throw new Error("No packages available");
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    return result.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch (e: any) {
    if (e?.userCancelled) return false;
    console.warn("[PlayBilling] Purchase failed:", e);
    return false;
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
    return info.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}
