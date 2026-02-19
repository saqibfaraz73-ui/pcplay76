/**
 * Google Play Store Billing
 *
 * This file provides the premium check via Play Store.
 * Until the app is published to Play Store, it uses a local mock state.
 *
 * WHEN READY TO CONNECT REAL BILLING:
 * 1. Install: npx cap add android (if not already done)
 * 2. Add your in-app product ID below (PREMIUM_PRODUCT_ID)
 * 3. Uncomment the real billing code and remove the mock
 * 4. Add the Capacitor In-App Purchases plugin:
 *    npm install @capgo/capacitor-purchases OR @revenuecat/purchases-capacitor
 */

import { Capacitor } from "@capacitor/core";

// Your Play Store subscription product ID (set this when you publish)
export const PREMIUM_PRODUCT_ID = "sangi_pos_premium_monthly"; // TODO: set your product ID

const PREMIUM_MOCK_KEY = "sangi_pos.premium_mock_state.v1";

export type PremiumStatus = {
  isPremium: boolean;
  expiresAt?: number; // timestamp or undefined
  source: "play_store" | "mock" | "none";
};

/**
 * Check premium status from Play Store.
 * Currently uses local mock state. Swap with real billing SDK when live.
 */
export async function checkPlayStorePremium(): Promise<PremiumStatus> {
  if (!Capacitor.isNativePlatform()) {
    return loadMockState();
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

  // Fallback to mock while not yet published
  return loadMockState();
}

/**
 * Restore / verify purchase from Play Store.
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

// ── Mock helpers (for development / before Play Store publishing) ──────────

function loadMockState(): PremiumStatus {
  try {
    const raw = localStorage.getItem(PREMIUM_MOCK_KEY);
    if (!raw) return { isPremium: false, source: "none" };
    const data = JSON.parse(raw) as { isPremium: boolean; expiresAt?: number };
    // Check expiry
    if (data.isPremium && data.expiresAt && Date.now() > data.expiresAt) {
      localStorage.removeItem(PREMIUM_MOCK_KEY);
      return { isPremium: false, source: "none" };
    }
    return { ...data, source: "mock" };
  } catch {
    return { isPremium: false, source: "none" };
  }
}

export function setMockPremium(isPremium: boolean, durationDays?: number): void {
  const expiresAt = durationDays ? Date.now() + durationDays * 86400_000 : undefined;
  localStorage.setItem(PREMIUM_MOCK_KEY, JSON.stringify({ isPremium, expiresAt }));
}

export function clearMockPremium(): void {
  localStorage.removeItem(PREMIUM_MOCK_KEY);
}
