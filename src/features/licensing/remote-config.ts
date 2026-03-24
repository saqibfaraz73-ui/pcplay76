/**
 * Remote Config — stub since AdMob/Play Store has been removed.
 * Kept for backward compatibility with any code referencing it.
 */

export interface RemoteConfig {
  rewarded_ad_id: string;
  interstitial_ad_id: string;
  is_testing: boolean;
  free_limit: number;
  ad_bonus: number;
  maintenance_message: string;
  force_update: boolean;
  min_version: string;
}

const DEFAULTS: RemoteConfig = {
  rewarded_ad_id: "",
  interstitial_ad_id: "",
  is_testing: false,
  free_limit: 5,
  ad_bonus: 5,
  maintenance_message: "",
  force_update: false,
  min_version: "1.0.0",
};

export async function getRemoteConfig(): Promise<RemoteConfig> {
  return DEFAULTS;
}

export function invalidateRemoteConfig(): void {}

export function getCachedConfig(): RemoteConfig {
  return DEFAULTS;
}
