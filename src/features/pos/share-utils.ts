/**
 * Shared utility for sharing AND saving files.
 *
 * save*  → SAF folder picker on Android (user chooses folder), browser download on web
 * share* → opens native share sheet (native) or Web Share API (web)
 */
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isSafAvailable, ensureSafAccess, SafStorage, uint8ToBase64 as safUint8ToBase64 } from "@/features/files/saf-storage";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
  }
  return btoa(binary);
}

/** Convert a Blob to Uint8Array */
async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE TO DEVICE — SAF folder picker on Android, browser download on web
// ─────────────────────────────────────────────────────────────────────────────

/** Browser download fallback */
function browserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Save file using SAF (Storage Access Framework) on Android.
 * Opens the folder picker so the user can choose exactly where to save.
 * The file will be visible in the device's file manager.
 */
async function nativeSaveViaSaf(bytes: Uint8Array, fileName: string, mimeType = "application/octet-stream"): Promise<boolean> {
  if (!isSafAvailable()) return false;
  try {
    const ok = await ensureSafAccess();
    if (!ok) return false;
    const base64Data = safUint8ToBase64(bytes);
    await SafStorage.writeBinaryFile({ relativePath: fileName, base64Data, mimeType });
    toast.success(`File saved: ${fileName}`);
    return true;
  } catch (e: any) {
    console.error("SAF save failed:", e);
    return false;
  }
}

/**
 * Fallback: save via share sheet (for non-SAF devices or if SAF fails)
 */
async function nativeSaveViaShareSheet(bytes: Uint8Array, fileName: string, mimeType = "application/octet-stream"): Promise<void> {
  const tmpPath = `__save_tmp__/${fileName}`;
  try {
    await Filesystem.writeFile({
      directory: Directory.Cache,
      path: tmpPath,
      data: uint8ToBase64(bytes),
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: tmpPath });
    await Share.share({ title: fileName, url: uri, dialogTitle: `Save ${fileName}` });
  } finally {
    try { await Filesystem.deleteFile({ directory: Directory.Cache, path: tmpPath }); } catch { /* ignore */ }
  }
}

/**
 * Save bytes to device: tries SAF folder picker first, falls back to share sheet.
 */
async function nativeSaveFile(bytes: Uint8Array, fileName: string, mimeType = "application/octet-stream"): Promise<void> {
  // Try SAF first (shows folder picker)
  const saved = await nativeSaveViaSaf(bytes, fileName, mimeType);
  if (saved) return;
  // Fallback to share sheet
  await nativeSaveViaShareSheet(bytes, fileName, mimeType);
}

/** Save a PDF blob to device — opens folder picker to choose save location */
export async function savePdfBlob(blob: Blob, name: string): Promise<void> {
  const fileName = `${name}.pdf`;
  if (Capacitor.isNativePlatform()) {
    const bytes = await blobToUint8(blob);
    await nativeSaveFile(bytes, fileName, "application/pdf");
    return;
  }
  browserDownload(blob, fileName);
  toast.success("File downloaded");
}

/** Save raw PDF bytes — opens folder picker to choose save location */
export async function savePdfBytes(bytes: Uint8Array, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await nativeSaveFile(bytes, fileName, "application/pdf");
    return;
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  browserDownload(blob, fileName);
  toast.success("File downloaded");
}

/** Save any file blob — opens folder picker to choose save location */
export async function saveFileBlob(blob: Blob, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const bytes = await blobToUint8(blob);
    await nativeSaveFile(bytes, fileName, blob.type || "application/octet-stream");
    return;
  }
  browserDownload(blob, fileName);
  toast.success("File downloaded");
}

/** Save text file — opens folder picker to choose save location */
export async function saveTextFile(content: string, fileName: string): Promise<void> {
  const blob = new Blob([content], { type: "application/octet-stream" });
  if (Capacitor.isNativePlatform()) {
    const bytes = await blobToUint8(blob);
    await nativeSaveFile(bytes, fileName);
    return;
  }
  browserDownload(blob, fileName);
  toast.success("File downloaded");
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARE — opens native share sheet or Web Share API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Share a file on native Android via a temp cache file.
 */
async function nativeShareViaCache(bytes: Uint8Array, fileName: string): Promise<void> {
  const tmpPath = `__share_tmp__/${fileName}`;
  try {
    await Filesystem.writeFile({
      directory: Directory.Cache,
      path: tmpPath,
      data: uint8ToBase64(bytes),
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: tmpPath });
    await Share.share({ title: fileName, url: uri, dialogTitle: fileName });
  } finally {
    try {
      await Filesystem.deleteFile({ directory: Directory.Cache, path: tmpPath });
    } catch { /* ignore cleanup errors */ }
  }
}

/** Share a PDF blob using native share or web fallback */
export async function sharePdfBlob(blob: Blob, name: string): Promise<void> {
  const fileName = `${name}.pdf`;
  if (Capacitor.isNativePlatform()) {
    const bytes = await blobToUint8(blob);
    await nativeShareViaCache(bytes, fileName);
    return;
  }
  const file = new File([blob], fileName, { type: "application/pdf" });
  await webShareFile(file, name);
}

/** Share raw PDF bytes on native or download on web */
export async function sharePdfBytes(bytes: Uint8Array, fileName: string, title?: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await nativeShareViaCache(bytes, fileName);
    return;
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const file = new File([blob], fileName, { type: "application/pdf" });
  await webShareFile(file, title ?? fileName);
}

/** Share any file blob using native share or fallback */
export async function shareFileBlob(blob: Blob, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const bytes = await blobToUint8(blob);
    await nativeShareViaCache(bytes, fileName);
    return;
  }
  const file = new File([blob], fileName, { type: blob.type });
  await webShareFile(file, fileName);
}

/** Web Share API with download fallback */
async function webShareFile(file: File, title: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      try {
        const url = URL.createObjectURL(file);
        await navigator.share({ title, url });
        URL.revokeObjectURL(url);
        return;
      } catch (err2: any) {
        if (err2?.name === "AbortError") return;
      }
    }
  }
  // Last resort: trigger download
  browserDownload(file, file.name);
  toast.success("File downloaded");
}

/** Share or download a text-based file (ZPL, TSPL, etc.) */
export async function shareTextFile(content: string, fileName: string, mimeType = "application/octet-stream"): Promise<void> {
  const blob = new Blob([content], { type: mimeType });
  if (Capacitor.isNativePlatform()) {
    const bytes = await blobToUint8(blob);
    await nativeShareViaCache(bytes, fileName);
    return;
  }
  const file = new File([blob], fileName, { type: mimeType });
  await webShareFile(file, fileName);
}
