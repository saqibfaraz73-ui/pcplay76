/**
 * AdMob stub — ads have been removed from this app.
 * All functions are no-ops that return safe defaults.
 */

export async function initAdMob(): Promise<void> {
  // No-op
}

export async function showRewardedAd(): Promise<boolean> {
  return false;
}

export async function showInterstitialAd(): Promise<void> {
  // No-op
}
