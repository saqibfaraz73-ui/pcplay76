/**
 * Shared utility for sharing files using native Capacitor Share or Web Share API.
 * On Android native: writes file to cache, then opens native share sheet.
 * On web: uses Web Share API or fallback download.
 */
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/** Convert a Blob to base64 string (without the data URL prefix) */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove "data:...;base64," prefix
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Native share via Capacitor Filesystem + Share plugins */
async function nativeShareFile(blob: Blob, fileName: string): Promise<void> {
  const base64 = await blobToBase64(blob);
  // Write to cache directory
  await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
  });
  // Get the native URI
  const uriResult = await Filesystem.getUri({
    directory: Directory.Cache,
    path: fileName,
  });
  // Open native share sheet
  await Share.share({
    title: fileName,
    url: uriResult.uri,
  });
}

/** Share a PDF blob using native share or fallback */
export async function sharePdfBlob(blob: Blob, name: string): Promise<void> {
  const fileName = `${name}.pdf`;
  if (Capacitor.isNativePlatform()) {
    await nativeShareFile(blob, fileName);
    return;
  }
  const file = new File([blob], fileName, { type: "application/pdf" });
  await webShareFile(file, name);
}

/** Share any file blob using native share or fallback */
export async function shareFileBlob(blob: Blob, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await nativeShareFile(blob, fileName);
    return;
  }
  const file = new File([blob], fileName, { type: blob.type });
  await webShareFile(file, fileName);
}

/** Web Share API with download fallback */
async function webShareFile(file: File, title: string): Promise<void> {
  if (navigator.share) {
    try {
      const canShare = navigator.canShare?.({ files: [file] });
      if (canShare) {
        await navigator.share({ title, files: [file] });
        return;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    }
  }
  // Fallback: trigger download
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
    await nativeShareFile(blob, fileName);
    return;
  }
  const file = new File([blob], fileName, { type: mimeType });
  await webShareFile(file, fileName);
}
