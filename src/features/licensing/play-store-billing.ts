/**
 * Play Store Billing stub — billing has been replaced with device-based licensing.
 * All functions are no-ops that return safe defaults.
 */

export type PremiumStatus = {
  isPremium: boolean;
  expiresAt?: number;
  source: "device" | "none";
};

export const PREMIUM_PRODUCT_ID = "";

export async function initBilling(): Promise<void> {}

export async function checkPlayStorePremium(): Promise<PremiumStatus> {
  return { isPremium: false, source: "none" };
}

export type SubscriptionPackage = {
  id: string;
  label: string;
  priceString: string;
  packageType: string;
  _raw: any;
};

export async function getSubscriptionPrice(): Promise<string | null> {
  return null;
}

export async function getAvailablePackages(): Promise<SubscriptionPackage[]> {
  return [];
}

export async function purchasePremium(): Promise<boolean> {
  return false;
}

export async function restorePlayStorePurchase(): Promise<boolean> {
  return false;
}
