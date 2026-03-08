/**
 * Remote Config via GitHub Gist
 *
 * Fetches app configuration from a GitHub Gist raw URL.
 * This allows changing ad IDs, free limits, and bonus credits
 * WITHOUT publishing a new APK to the Play Store.
 *
 * SETUP:
 * 1. Go to https://gist.github.com
 * 2. Create a file named "sangi_config.json"
 * 3. Paste a JSON object like:
 *    {
 *      "rewarded_ad_id": "ca-app-pub-3940256099942544/5224354917",
 *      "interstitial_ad_id": "ca-app-pub-3940256099942544/1033173712",
 *      "is_testing": true,
 *      "free_limit": 5,
 *      "ad_bonus": 5,
 *      "maintenance_message": "",
 *      "force_update": false,
 *      "min_version": "1.0.0"
 *    }
 * 4. Click "Create Public Gist"
 * 5. Click the "Raw" button and copy that URL
 * 6. Paste the raw URL below as GIST_RAW_URL
 *
 * When you want to switch from test to real ads, just edit the Gist!
 */

// ─── YOUR GIST RAW URL HERE ─────────────────────────────────────────────────
const GIST_RAW_URL = "https://gist.githubusercontent.com/saqibfaraz73-ui/bf2741c5006374a08ed48c89671c756b/raw/sangi_config.json";
// ─────────────────────────────────────────────────────────────────────────────

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

// Hardcoded defaults (used when Gist is unreachable or URL not set)
const DEFAULTS: RemoteConfig = {
  rewarded_ad_id: "ca-app-pub-4619723552746870/5875321081",
  interstitial_ad_id: "ca-app-pub-4619723552746870/8350167538",
  is_testing: false,
  free_limit: 5,
  ad_bonus: 5,
  maintenance_message: "",
  force_update: false,
  min_version: "1.0.0",
};

let _cached: RemoteConfig | null = null;
let _lastFetch = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch remote config from GitHub Gist.
 * Caches for 30 minutes. Falls back to defaults on error.
 */
export async function getRemoteConfig(): Promise<RemoteConfig> {
  const now = Date.now();

  // Return cache if fresh
  if (_cached && now - _lastFetch < CACHE_TTL) {
    return _cached;
  }

  // If no URL configured, use defaults
  if (!GIST_RAW_URL) {
    console.log("[RemoteConfig] No Gist URL configured, using defaults");
    _cached = DEFAULTS;
    _lastFetch = now;
    return DEFAULTS;
  }

  try {
    // Add cache-busting param to avoid GitHub CDN caching
    const url = GIST_RAW_URL + (GIST_RAW_URL.includes("?") ? "&" : "?") + `_t=${now}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();

    // Try JSON parse first
    let data: Partial<RemoteConfig>;
    try {
      data = JSON.parse(text);
    } catch {
      // Fallback: treat as plain text (single ad ID line)
      const adId = text.trim();
      if (adId && adId.startsWith("ca-app-pub-")) {
        data = { rewarded_ad_id: adId };
      } else {
        data = {};
      }
    }

    // Merge with defaults (so missing fields use defaults)
    _cached = { ...DEFAULTS, ...data };
    _lastFetch = now;
    console.log("[RemoteConfig] Fetched successfully:", JSON.stringify(_cached));
    return _cached;
  } catch (e) {
    console.warn("[RemoteConfig] Fetch failed, using defaults:", e);
    // Use cached value if available, otherwise defaults
    if (!_cached) _cached = DEFAULTS;
    _lastFetch = now;
    return _cached;
  }
}

/** Force refresh config (e.g., on app resume) */
export function invalidateRemoteConfig(): void {
  _lastFetch = 0;
}

/** Get cached config synchronously (may be null if never fetched) */
export function getCachedConfig(): RemoteConfig {
  return _cached ?? DEFAULTS;
}
