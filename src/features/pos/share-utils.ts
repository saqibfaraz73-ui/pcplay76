/**
 * Shared utility for sharing AND saving files.
 *
 * save*  → writes to app-private storage (native) or browser download (web)
 * share* → opens native share sheet (native) or Web Share API (web)
 */
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

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
// SAVE TO DEVICE — writes to app-private storage on native, browser download on web
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
 * Save file by opening the native share sheet so the user can choose
 * where to save (Downloads, Drive, WhatsApp, etc.).
 * Files saved this way are visible in the device's file manager.
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

/** Save a PDF blob to device — opens share sheet so user picks visible location */
export async function savePdfBlob(blob: Blob, name: string): Promise<void> {
  const fileName = `${name}.pdf`;
  if (Capacitor.isNativePlatform()) {
    const bytes = await blobToUint8(blob);
    await nativeSaveViaShareSheet(bytes, fileName, "application/pdf");
    return;
  }
  browserDownload(blob, fileName);
  toast.success("File downloaded");
}

/** Save raw PDF bytes — opens share sheet so user picks visible location */
export async function savePdfBytes(bytes: Uint8Array, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await nativeSaveViaShareSheet(bytes, fileName, "application/pdf");
    return;
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  browserDownload(blob, fileName);
  toast.success("File downloaded");
}

/** Save any file blob — opens share sheet so user picks visible location */
export async function saveFileBlob(blob: Blob, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const bytes = await blobToUint8(blob);
    await nativeSaveViaShareSheet(bytes, fileName, blob.type || "application/octet-stream");
    return;
  }
  browserDownload(blob, fileName);
  toast.success("File downloaded");
}

/** Save text file — opens share sheet so user picks visible location */
export async function saveTextFile(content: string, fileName: string): Promise<void> {
  const blob = new Blob([content], { type: "application/octet-stream" });
  if (Capacitor.isNativePlatform()) {
    const bytes = await blobToUint8(blob);
    await nativeSaveViaShareSheet(bytes, fileName);
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
