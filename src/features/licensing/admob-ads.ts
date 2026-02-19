/**
 * AdMob Rewarded Ads Integration
 *
 * Replace the placeholder IDs below with your real AdMob IDs before publishing:
 *   ADMOB_APP_ID     → Your AdMob App ID (ca-app-pub-XXXXXXXX~XXXXXXXX)
 *   REWARDED_AD_ID   → Your Rewarded Ad Unit ID (ca-app-pub-XXXXXXXX/XXXXXXXX)
 *
 * Your real AdMob IDs are configured below.
 */

import { Capacitor } from "@capacitor/core";

// ─── REPLACE THESE WITH YOUR REAL IDs ────────────────────────────────────────
export const ADMOB_APP_ID = "ca-app-pub-4619723552746870~3003839065";
export const REWARDED_AD_ID = "ca-app-pub-4619723552746870/5875321081";
// ─────────────────────────────────────────────────────────────────────────────

let admobModule: any = null;

async function getAdMob() {
  if (admobModule) return admobModule;
  try {
    const mod = await import("@capacitor-community/admob");
    admobModule = mod;
    return mod;
  } catch {
    return null;
  }
}

let admobInitialized = false;

export async function initAdMob(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (admobInitialized) return;
  try {
    const { AdMob } = (await getAdMob()) ?? {};
    if (!AdMob) return;
    await AdMob.initialize({
      requestTrackingAuthorization: false,
      testingDevices: [], // add your device ID here while testing
      initializeForTesting: false,
    });
    admobInitialized = true;
    console.log("[AdMob] Initialized");
  } catch (e) {
    console.warn("[AdMob] Init failed:", e);
  }
}

/**
 * Show a rewarded ad. Resolves true if the user earned the reward, false otherwise.
 * On web/browser always returns false (no ads in browser).
 */
export async function showRewardedAd(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    // In browser/preview: simulate the ad for testing
    return new Promise((resolve) => {
      const confirmed = window.confirm(
        "📺 [Dev Mode] A rewarded ad would show here.\n\nClick OK to simulate watching the ad and earn +3 entries."
      );
      resolve(confirmed);
    });
  }

  try {
    const { AdMob, RewardAdPluginEvents } = (await getAdMob()) ?? {};
    if (!AdMob) return false;

    await initAdMob();

    let earned = false;

    // Listen for reward event
    const rewardListener = await AdMob.addListener(
      RewardAdPluginEvents.Rewarded,
      () => { earned = true; }
    );

    await AdMob.prepareRewardVideoAd({
      adId: REWARDED_AD_ID,
      isTesting: false, // set true while testing
    });

    await new Promise<void>((resolve, reject) => {
      let closed = false;

      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        if (!closed) { closed = true; resolve(); }
      }).catch(() => {});

      AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err: any) => {
        if (!closed) { closed = true; reject(new Error(err?.message ?? "Ad failed to load")); }
      }).catch(() => {});

      AdMob.showRewardVideoAd().catch((e: any) => {
        if (!closed) { closed = true; reject(e); }
      });
    });

    rewardListener.remove();
    return earned;
  } catch (e) {
    console.warn("[AdMob] Rewarded ad error:", e);
    return false;
  }
}
