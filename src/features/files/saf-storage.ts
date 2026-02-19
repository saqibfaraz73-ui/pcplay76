/**
 * saf-storage.ts
 *
 * TypeScript client for SafStoragePlugin (Storage Access Framework).
 * On Android native: uses the SAF plugin (zero storage permissions needed).
 * On web / iOS: falls back to Capacitor Filesystem (existing behaviour).
 */

import { registerPlugin, Capacitor } from "@capacitor/core";

// ─── Plugin interface ──────────────────────────────────────────────────────

interface SafStoragePlugin {
  openFolderPicker(): Promise<{ uri: string }>;
  hasFolderAccess(): Promise<{ hasAccess: boolean; uri: string | null }>;
  writeTextFile(opts: { relativePath: string; contents: string }): Promise<{ uri: string }>;
  writeBinaryFile(opts: { relativePath: string; base64Data: string; mimeType?: string }): Promise<{ uri: string }>;
  readTextFile(opts: { relativePath: string }): Promise<{ contents: string }>;
  getFileUri(opts: { relativePath: string }): Promise<{ uri: string }>;
  listFiles(opts: { relativePath?: string }): Promise<{ files: string[] }>;
  deleteFile(opts: { relativePath: string }): Promise<void>;
}

// Registers the native plugin — no-op on web (plugin won't be found but isNativePlatform guards protect calls).
const SafStorage = registerPlugin<SafStoragePlugin>("SafStorage");

export { SafStorage };

// ─── Helpers ──────────────────────────────────────────────────────────────

export function isSafAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * Ensures the user has selected a folder at least once.
 * If not, opens the folder picker automatically.
 * Returns true if access is confirmed.
 */
export async function ensureSafAccess(): Promise<boolean> {
  if (!isSafAvailable()) return false;
  try {
    const { hasAccess } = await SafStorage.hasFolderAccess();
    if (hasAccess) return true;
    // Open picker — user must choose the folder once
    await SafStorage.openFolderPicker();
    const { hasAccess: afterPick } = await SafStorage.hasFolderAccess();
    return afterPick;
  } catch {
    return false;
  }
}

// ─── Uint8 ↔ Base64 ──────────────────────────────────────────────────────

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
  }
  return btoa(binary);
}
