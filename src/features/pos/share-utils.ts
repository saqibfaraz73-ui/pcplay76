/**
 * Shared utility for sharing files using native Capacitor Share or Web Share API.
 * On Android native: uses writePdfFile/shareFile from sangi-folders (same as Reports).
 * On web: uses Web Share API or fallback download.
 */
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { writePdfFile, shareFile } from "@/features/files/sangi-folders";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Convert a Blob to Uint8Array */
async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Convert a Blob to base64 string (without the data URL prefix) */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = await blobToUint8(blob);
  return uint8ToBase64(bytes);
}

/** Native share via Capacitor Filesystem + Share plugins — same method as Reports */
async function nativeShareFile(blob: Blob, fileName: string): Promise<void> {
  const base64 = await blobToBase64(blob);
  const path = `Sangi Pos/Shared/${fileName}`;
  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  const uriResult = await Filesystem.getUri({
    directory: Directory.Documents,
    path,
  });
  await Share.share({ title: fileName, url: uriResult.uri, dialogTitle: fileName });
}

/** Share a PDF blob using native share or fallback — same as Reports */
export async function sharePdfBlob(blob: Blob, name: string): Promise<void> {
  const fileName = `${name}.pdf`;
  if (Capacitor.isNativePlatform()) {
    const pdfBytes = await blobToUint8(blob);
    const { uri } = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes });
    await shareFile({ title: fileName, uri });
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
  // Try sharing with file directly (works on Android Chrome, Samsung Browser, etc.)
  if (navigator.share) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return; // user dismissed — don't download
      // File sharing not supported, try without file
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
    await nativeShareFile(blob, fileName);
    return;
  }
  const file = new File([blob], fileName, { type: mimeType });
  await webShareFile(file, fileName);
}
