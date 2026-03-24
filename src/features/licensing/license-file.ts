/**
 * Encrypted license file system.
 */

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import { folderPath, ensureSangiFolders } from "@/features/files/sangi-folders";

const ENCRYPTION_KEY = "7718";
const LICENSE_FILE_NAME = "license.sangi";
const FILE_MAGIC = "SANGILIC";

interface LicenseFilePayload {
  magic: string;
  deviceId: string;
  activatedAt: string;
  validUntil?: string;
  validUntilTs?: number;
  checksum: string;
}

function xorCipher(text: string, key: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

function generateChecksum(deviceId: string, activatedAt: string, validUntil?: string, validUntilTs?: number): string {
  const input = `${FILE_MAGIC}:${deviceId}:${activatedAt}:${validUntil ?? ""}:${validUntilTs ?? ""}:${ENCRYPTION_KEY}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, "0");
}

export function generateLicenseBase64(deviceId: string, validUntil?: string, validUntilTs?: number): string {
  const activatedAt = new Date().toISOString();
  const checksum = generateChecksum(deviceId, activatedAt, validUntil, validUntilTs);
  const payload: LicenseFilePayload = { magic: FILE_MAGIC, deviceId, activatedAt, validUntil, validUntilTs, checksum };
  const json = JSON.stringify(payload);
  const encrypted = xorCipher(json, ENCRYPTION_KEY);
  return btoa(encrypted);
}

export async function generateLicenseFile(deviceId: string, validUntil?: string, validUntilTs?: number): Promise<{ path: string; uri: string }> {
  const activatedAt = new Date().toISOString();
  const checksum = generateChecksum(deviceId, activatedAt, validUntil, validUntilTs);

  const payload: LicenseFilePayload = { magic: FILE_MAGIC, deviceId, activatedAt, validUntil, validUntilTs, checksum };
  const json = JSON.stringify(payload);
  const encrypted = xorCipher(json, ENCRYPTION_KEY);
  const base64 = btoa(encrypted);

  const attempts: { directory: Directory; path: string }[] = [
    { directory: Directory.Data, path: `${folderPath("Backup")}/${LICENSE_FILE_NAME}` },
    { directory: Directory.Documents, path: `${folderPath("Backup")}/${LICENSE_FILE_NAME}` },
    { directory: Directory.Cache, path: LICENSE_FILE_NAME },
  ];

  for (const attempt of attempts) {
    try {
      if (attempt.directory === Directory.Data || attempt.directory === Directory.Documents) {
        await ensureSangiFolders();
      }
      await Filesystem.writeFile({
        directory: attempt.directory,
        path: attempt.path,
        data: base64,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      const uriResult = await Filesystem.getUri({ directory: attempt.directory, path: attempt.path });
      return { path: attempt.path, uri: uriResult.uri };
    } catch {
      // Try next directory
    }
  }

  throw new Error("Could not write license file to any directory");
}

export async function shareLicenseFile(uri: string) {
  await Share.share({
    title: "Sangi POS Premium License",
    url: uri,
    dialogTitle: "Send License File to Customer",
  });
}

export function decodeLicenseBase64(base64: string): { deviceId: string; activatedAt: string; validUntil?: string; validUntilTs?: number } | null {
  try {
    const encrypted = atob(base64.trim());
    const json = xorCipher(encrypted, ENCRYPTION_KEY);
    const payload: LicenseFilePayload = JSON.parse(json);
    if (payload.magic !== FILE_MAGIC) return null;
    const expectedChecksum = generateChecksum(payload.deviceId, payload.activatedAt, payload.validUntil, payload.validUntilTs);
    if (payload.checksum !== expectedChecksum) return null;
    return { deviceId: payload.deviceId, activatedAt: payload.activatedAt, validUntil: payload.validUntil, validUntilTs: payload.validUntilTs };
  } catch {
    return null;
  }
}

export async function readLicenseFile(): Promise<{ deviceId: string; activatedAt: string; validUntil?: string; validUntilTs?: number } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const possiblePaths = [
    `${folderPath("Backup")}/${LICENSE_FILE_NAME}`,
    `Sangi Pos/${LICENSE_FILE_NAME}`,
    LICENSE_FILE_NAME,
  ];

  const directories = [Directory.Data, Directory.Documents, Directory.ExternalStorage];

  for (const dir of directories) {
    for (const path of possiblePaths) {
      try {
        const result = await Filesystem.readFile({
          directory: dir,
          path,
          encoding: Encoding.UTF8,
        });

        const base64 = typeof result.data === "string" ? result.data : "";
        if (!base64) continue;

        const decoded = decodeLicenseBase64(base64);
        if (decoded) return decoded;
      } catch {
        // File doesn't exist — try next
      }
    }
  }

  return null;
}
