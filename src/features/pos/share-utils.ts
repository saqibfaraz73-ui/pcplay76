/**
 * Shared utility for sharing files using native Capacitor Share or Web Share API.
 *
 * On Android native (SAF): writes a temp file to the Cache directory and shares
 * that URI — this avoids triggering the SAF folder picker entirely.
 * On web: uses Web Share API or fallback download.
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

/**
 * Share a file on native Android via a temp cache file.
 * Does NOT trigger the SAF folder picker — cache dir needs no permissions.
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

/** Share a PDF blob using native share (cache-based, no SAF) or web fallback */
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

/** Share raw PDF bytes on native (cache-based) or download on web */
export async function sharePdfBytes(bytes: Uint8Array, fileName: string, title?: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await nativeShareViaCache(bytes, fileName);
    return;
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const file = new File([blob], fileName, { type: "application/pdf" });
  await webShareFile(file, title ?? fileName);
}

/** Share any file blob using native share (cache-based) or fallback */
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
      if (err?.name === "AbortError") return; // user dismissed — don't download
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
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
