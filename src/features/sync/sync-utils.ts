/**
 * Sync Utilities — shared helpers for sync config access
 */
import type { SyncConfig } from "./sync-types";
import { DEFAULT_SYNC_CONFIG } from "./sync-types";

const STORAGE_KEY = "sangi_sync_config";

export function getSyncConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_SYNC_CONFIG;
  } catch {
    return DEFAULT_SYNC_CONFIG;
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
