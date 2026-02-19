/**
 * Google Play Store Billing
 *
 * Premium status is EXCLUSIVELY determined by Google Play Store.
 * No mock, no local override — only Play Store billing counts.
 *
 * WHEN READY TO CONNECT REAL BILLING:
 * 1. Install: npm install @revenuecat/purchases-capacitor
 * 2. Set your RevenueCat API key and entitlement ID below
 * 3. Uncomment the real billing block and remove the fallback
 */

import { Capacitor } from "@capacitor/core";

export const PREMIUM_PRODUCT_ID = "sangi_pos_premium_monthly";

export type PremiumStatus = {
  isPremium: boolean;
  expiresAt?: number;
  source: "play_store" | "none";
};

/**
 * Check premium status from Play Store.
 * Returns false until RevenueCat is connected.
 */
export async function checkPlayStorePremium(): Promise<PremiumStatus> {
  if (!Capacitor.isNativePlatform()) {
    return { isPremium: false, source: "none" };
  }

  // ── REAL BILLING (uncomment when app is on Play Store) ──────────────────
  // try {
  //   const { Purchases } = await import('@revenuecat/purchases-capacitor');
  //   const info = await Purchases.getCustomerInfo();
  //   const isPremium = info.customerInfo.entitlements.active['premium'] !== undefined;
  //   const expiry = info.customerInfo.entitlements.active['premium']?.expirationDate;
  //   return {
  //     isPremium,
  //     expiresAt: expiry ? new Date(expiry).getTime() : undefined,
  //     source: 'play_store',
  //   };
  // } catch (e) {
  //   console.warn('[PlayBilling] Check failed:', e);
  //   return { isPremium: false, source: 'none' };
  // }
  // ────────────────────────────────────────────────────────────────────────

  return { isPremium: false, source: "none" };
}

/**
 * Restore purchase from Play Store.
 * Returns true if a valid premium subscription was found.
 */
export async function restorePlayStorePurchase(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  // ── REAL BILLING ─────────────────────────────────────────────────────────
  // try {
  //   const { Purchases } = await import('@revenuecat/purchases-capacitor');
  //   const info = await Purchases.restorePurchases();
  //   return info.customerInfo.entitlements.active['premium'] !== undefined;
  // } catch {
  //   return false;
  // }
  // ────────────────────────────────────────────────────────────────────────

  return false;
}
