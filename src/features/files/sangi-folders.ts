/**
 * sangi-folders.ts
 *
 * Unified file I/O layer for Sangi POS.
 *
 * ┌─────────────────────────────────────────────────┐
 * │  Android native  →  SafStoragePlugin (SAF)       │
 * │  Web / iOS       →  Capacitor Filesystem         │
 * └─────────────────────────────────────────────────┘
 *
 * SAF (Storage Access Framework) is the modern Android approach:
 *  - Zero storage permissions required in AndroidManifest.xml
 *  - User picks a folder ONCE; the app gets a permanent URI
 *  - Files are saved directly to that folder forever
 */

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { SafStorage, isSafAvailable, ensureSafAccess, uint8ToBase64 } from "./saf-storage";

export const SANGI_ROOT = "Sangi Pos";

export type SangiFolder = "Backup" | "Sales Report" | "Credit" | "Images";

export function folderPath(folder: SangiFolder): string {
  return `${SANGI_ROOT}/${folder}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ensure folders exist  (SAF: no-op — SAF creates dirs on demand)
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureSangiFolders(): Promise<void> {
  if (isSafAvailable()) {
    // SAF creates intermediate directories automatically when writing files.
    return;
  }
  // Web / iOS: use Capacitor Filesystem
  const targets: SangiFolder[] = ["Backup", "Sales Report", "Credit", "Images"];
  for (const f of targets) {
    try {
      await Filesystem.mkdir({ directory: Directory.Documents, path: folderPath(f), recursive: true });
    } catch {
      // ignore if already exists or unsupported
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Base64 ↔ Uint8 helpers (web path)
// ─────────────────────────────────────────────────────────────────────────────

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// readPdfBlobUrl  (reading back a previously-written PDF for preview)
// ─────────────────────────────────────────────────────────────────────────────

export async function readPdfBlobUrl(args: { path: string }): Promise<{ url: string; revoke: () => void }> {
  if (isSafAvailable()) {
    // Read via SAF then turn into a Blob URL
    const { contents } = await SafStorage.readTextFile({ relativePath: args.path });
    // Contents may be raw base64 if we stored it that way
    const bytes = base64ToUint8(contents);
    const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }

  // Web / iOS path
  const res = await Filesystem.readFile({ directory: Directory.Documents, path: args.path });
  const blob =
    typeof res.data === "string"
      ? (() => {
          const bytes = base64ToUint8(res.data);
          const ab = bytes.buffer.slice(0) as ArrayBuffer;
          return new Blob([ab], { type: "application/pdf" });
        })()
      : res.data;
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

// ─────────────────────────────────────────────────────────────────────────────
// writeTextFile
// ─────────────────────────────────────────────────────────────────────────────

export async function writeTextFile(args: {
  folder: SangiFolder;
  fileName: string;
  contents: string;
}): Promise<{ path: string; uri: string }> {
  const relativePath = `${folderPath(args.folder)}/${args.fileName}`;

  if (isSafAvailable()) {
    const ok = await ensureSafAccess();
    if (!ok) throw new Error("Storage folder not selected. Please choose a folder when prompted.");
    const { uri } = await SafStorage.writeTextFile({ relativePath, contents: args.contents });
    return { path: relativePath, uri };
  }

  // Web / iOS
  await ensureSangiFolders();
  await Filesystem.writeFile({
    directory: Directory.Documents,
    path: relativePath,
    data: args.contents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  const uriResult = await Filesystem.getUri({ directory: Directory.Documents, path: relativePath });
  return { path: relativePath, uri: uriResult.uri };
}

// ─────────────────────────────────────────────────────────────────────────────
// writePdfFile
// ─────────────────────────────────────────────────────────────────────────────

export async function writePdfFile(args: {
  folder: SangiFolder;
  fileName: string;
  pdfBytes: Uint8Array;
}): Promise<{ path: string; uri: string }> {
  const relativePath = `${folderPath(args.folder)}/${args.fileName}`;

  if (isSafAvailable()) {
    const ok = await ensureSafAccess();
    if (!ok) throw new Error("Storage folder not selected. Please choose a folder when prompted.");
    const base64Data = uint8ToBase64(args.pdfBytes);
    const { uri } = await SafStorage.writeBinaryFile({ relativePath, base64Data, mimeType: "application/pdf" });
    return { path: relativePath, uri };
  }

  // Web / iOS
  await ensureSangiFolders();
  await Filesystem.writeFile({
    directory: Directory.Documents,
    path: relativePath,
    data: uint8ToBase64(args.pdfBytes),
    recursive: true,
  });
  const uriResult = await Filesystem.getUri({ directory: Directory.Documents, path: relativePath });
  return { path: relativePath, uri: uriResult.uri };
}

// ─────────────────────────────────────────────────────────────────────────────
// shareFile  (unchanged — Share plugin works the same with both URI types)
// ─────────────────────────────────────────────────────────────────────────────

export async function shareFile(args: { title: string; uri: string }): Promise<void> {
  await Share.share({ title: args.title, url: args.uri, dialogTitle: args.title });
}
