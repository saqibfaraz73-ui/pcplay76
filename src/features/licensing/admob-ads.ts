/**
 * AdMob Rewarded Ads Integration
 *
 * TEST MODE is controlled by the IS_TESTING flag below.
 * Set IS_TESTING = false before publishing to production.
 *
 * When IS_TESTING = true:
 *   - Google's official demo ad unit IDs are used (safe, policy-compliant)
 *   - isTesting: true is passed to every ad request
 *   - initializeForTesting: true is passed to AdMob.initialize()
 *   - No real ad impressions or revenue are generated
 */

import { Capacitor } from "@capacitor/core";
import { getRemoteConfig, getCachedConfig } from "./remote-config";

// App ID (not changeable remotely — used only at init)
const ADMOB_APP_ID = "ca-app-pub-4619723552746870~3003839065";

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
    const config = await getRemoteConfig();
    const { AdMob } = (await getAdMob()) ?? {};
    if (!AdMob) return;
    await AdMob.initialize({
      requestTrackingAuthorization: false,
      testingDevices: [],
      initializeForTesting: config.is_testing,
    });
    admobInitialized = true;
    console.log(`[AdMob] Initialized (${config.is_testing ? "TEST MODE" : "PRODUCTION"}, rewarded: ${config.rewarded_ad_id})`);
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
    const config = getCachedConfig();
    const { AdMob, RewardAdPluginEvents } = (await getAdMob()) ?? {};
    if (!AdMob) return false;

    await initAdMob();

    let earned = false;

    // Listen for reward event
    const rewardListener = await AdMob.addListener(
      RewardAdPluginEvents.Rewarded,
      () => { earned = true; }
    );

    console.log(`[AdMob] Loading rewarded ad: ${config.rewarded_ad_id} (testing: ${config.is_testing})`);
    await AdMob.prepareRewardVideoAd({
      adId: config.rewarded_ad_id,
      isTesting: config.is_testing,
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

// ── Interstitial Ad ──────────────────────────────────────────────────────────

let lastInterstitialShown = 0;
const INTERSTITIAL_COOLDOWN_MS = 60_000; // show at most once per minute

/**
 * Show an interstitial ad on section navigation (free users only).
 * Silently skips if: premium user, cooldown active, web/browser, or ad fails.
 */
export async function showInterstitialAd(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return; // skip in browser/preview
  const now = Date.now();
  if (now - lastInterstitialShown < INTERSTITIAL_COOLDOWN_MS) return;

  try {
    const { AdMob, InterstitialAdPluginEvents } = (await getAdMob()) ?? {};
    if (!AdMob) return;

    await initAdMob();

    const config = getCachedConfig();
    await AdMob.prepareInterstitial({ adId: config.interstitial_ad_id, isTesting: config.is_testing });

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };

      AdMob.addListener(InterstitialAdPluginEvents.Dismissed, finish).catch(() => {});
      AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, finish).catch(() => {});

      AdMob.showInterstitial().catch(finish);
    });

    lastInterstitialShown = Date.now();
  } catch (e) {
    console.warn("[AdMob] Interstitial error:", e);
  }
}
