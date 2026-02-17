/**
 * Shared utility for sharing/downloading files using native share API or fallback download.
 * Works on both mobile (Capacitor) and web.
 */
import { toast } from "sonner";

/** Share a PDF blob using native share or fallback to download */
export async function sharePdfBlob(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], `${name}.pdf`, { type: "application/pdf" });
  await shareFile(file, name);
}

/** Share any file blob using native share or fallback to download */
export async function shareFileBlob(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type });
  await shareFile(file, fileName);
}

async function shareFile(file: File, title: string): Promise<void> {
  // Try native Web Share API (works on Android, iOS Safari, etc.)
  if (navigator.share) {
    try {
      const canShare = navigator.canShare?.({ files: [file] });
      if (canShare) {
        await navigator.share({ title, files: [file] });
        return;
      }
    } catch (err: any) {
      // AbortError means user cancelled – not an error
      if (err?.name === "AbortError") return;
      // Fall through to download
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
  const file = new File([blob], fileName, { type: mimeType });
  await shareFile(file, fileName);
}
