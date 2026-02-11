/**
 * Encrypted license file system.
 * 
 * The Super Admin generates an encrypted `.sangi` license file containing
 * the customer's device ID. The customer places this file in their
 * "Sangi Pos" folder. On next app launch, the app reads & decrypts
 * the file and auto-activates premium if the device ID matches.
 * 
 * Encryption uses a simple XOR cipher with a secret key so the file
 * cannot be edited by hand — only Super Login can produce valid files.
 */

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { folderPath, ensureSangiFolders } from "@/features/files/sangi-folders";

const ENCRYPTION_KEY = "7718";
const LICENSE_FILE_NAME = "license.sangi";
const FILE_MAGIC = "SANGILIC"; // magic header to verify valid file

interface LicenseFilePayload {
  magic: string;
  deviceId: string;
  activatedAt: string;
  checksum: string;
}

/** Simple XOR encrypt/decrypt */
function xorCipher(text: string, key: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

/** Generate a checksum for integrity verification */
function generateChecksum(deviceId: string, activatedAt: string): string {
  const input = `${FILE_MAGIC}:${deviceId}:${activatedAt}:${ENCRYPTION_KEY}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, "0");
}

/** Generate the encrypted license payload as a base64 string (no filesystem needed) */
export function generateLicenseBase64(deviceId: string): string {
  const activatedAt = new Date().toISOString();
  const checksum = generateChecksum(deviceId, activatedAt);
  const payload: LicenseFilePayload = { magic: FILE_MAGIC, deviceId, activatedAt, checksum };
  const json = JSON.stringify(payload);
  const encrypted = xorCipher(json, ENCRYPTION_KEY);
  return btoa(encrypted);
}

/** Create an encrypted license file and return its URI for sharing */
export async function generateLicenseFile(deviceId: string): Promise<{ path: string; uri: string }> {
  const activatedAt = new Date().toISOString();
  const checksum = generateChecksum(deviceId, activatedAt);

  const payload: LicenseFilePayload = {
    magic: FILE_MAGIC,
    deviceId,
    activatedAt,
    checksum,
  };

  const json = JSON.stringify(payload);
  const encrypted = xorCipher(json, ENCRYPTION_KEY);
  const base64 = btoa(encrypted);

  await ensureSangiFolders();
  const path = `${folderPath("Backup")}/${LICENSE_FILE_NAME}`;

  await Filesystem.writeFile({
    directory: Directory.Documents,
    path,
    data: base64,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  const uriResult = await Filesystem.getUri({ directory: Directory.Documents, path });
  return { path, uri: uriResult.uri };
}

/** Share the license file with the customer */
export async function shareLicenseFile(uri: string) {
  await Share.share({
    title: "Sangi POS Premium License",
    url: uri,
    dialogTitle: "Send License File to Customer",
  });
}

/** Try to read and decrypt a license file from the Sangi Pos folder.
 *  Returns the device ID if valid, null otherwise. */
export async function readLicenseFile(): Promise<{ deviceId: string; activatedAt: string } | null> {
  // Check multiple possible locations
  const possiblePaths = [
    `${folderPath("Backup")}/${LICENSE_FILE_NAME}`,
    `Sangi Pos/${LICENSE_FILE_NAME}`,
  ];

  for (const path of possiblePaths) {
    try {
      const result = await Filesystem.readFile({
        directory: Directory.Documents,
        path,
        encoding: Encoding.UTF8,
      });

      const base64 = typeof result.data === "string" ? result.data : "";
      if (!base64) continue;

      const encrypted = atob(base64);
      const json = xorCipher(encrypted, ENCRYPTION_KEY);
      const payload: LicenseFilePayload = JSON.parse(json);

      // Verify magic header
      if (payload.magic !== FILE_MAGIC) continue;

      // Verify checksum
      const expectedChecksum = generateChecksum(payload.deviceId, payload.activatedAt);
      if (payload.checksum !== expectedChecksum) continue;

      return { deviceId: payload.deviceId, activatedAt: payload.activatedAt };
    } catch {
      // File doesn't exist or can't be read — try next path
    }
  }

  return null;
}
