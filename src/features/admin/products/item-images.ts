import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

import { ensureSangiFolders, folderPath } from "@/features/files/sangi-folders";

function safeExtFromFile(file: File) {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return byType[file.type] ?? "jpg";
}

export function canUploadItemImages() {
  return Capacitor.isNativePlatform();
}

/**
 * Resize and compress an image file to max 800x800 pixels, JPEG 80% quality.
 * Returns a new File ≤~80KB with good visual quality.
 */
async function resizeAndCompress(file: File, maxDim = 800, quality = 0.80): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Scale down if larger than maxDim
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Try WebP first (smaller), fall back to JPEG
      const tryFormat = (mime: string, q: number): Promise<Blob> =>
        new Promise((res) => canvas.toBlob((b) => res(b!), mime, q));

      (async () => {
        let blob = await tryFormat("image/webp", quality);
        let ext = "webp";
        // If browser doesn't support webp encoding, blob may be png — fall back to jpeg
        if (!blob || blob.type !== "image/webp") {
          blob = await tryFormat("image/jpeg", quality);
          ext = "jpg";
        }
        const resized = new File([blob], `resized.${ext}`, { type: blob.type });
        resolve(resized);
      })();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image for resizing."));
    };
    img.src = url;
  });
}

/**
 * Saves image to device filesystem (Documents/Sangi Pos/Images/items/...).
 * Automatically resizes large images to 800×800 and compresses to keep size small.
 * Returns the file path to store on the item record.
 */
export async function saveItemImage(args: { itemId: string; file: File }): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Image upload is only available in the installed app (Android/iOS).");
  }

  // Auto-resize & compress instead of blocking large files
  let file = args.file;
  if (file.size > 100 * 1024) {
    file = await resizeAndCompress(file);
  }

  await ensureSangiFolders();

  const ext = safeExtFromFile(file);
  const itemsDir = `${folderPath("Images")}/items`;
  try {
    await Filesystem.mkdir({ directory: Directory.Documents, path: itemsDir, recursive: true });
    // Create .nomedia file to prevent images from appearing in gallery
    try {
      await Filesystem.writeFile({
        directory: Directory.Documents,
        path: `${itemsDir}/.nomedia`,
        data: "",
        encoding: Encoding.UTF8,
      });
    } catch { /* ignore */ }
  } catch {
    // ignore
  }

  // Delete ALL existing images for this item (any extension, any timestamp suffix)
  try {
    const listing = await Filesystem.readdir({ directory: Directory.Documents, path: itemsDir });
    for (const entry of listing.files) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (name.startsWith(args.itemId)) {
        try {
          await Filesystem.deleteFile({ directory: Directory.Documents, path: `${itemsDir}/${name}` });
        } catch {
          // Ignore individual delete failures
        }
      }
    }
  } catch {
    // Fallback: try deleting common extensions
    const possibleExts = ["jpg", "png", "webp"];
    for (const oldExt of possibleExts) {
      try {
        await Filesystem.deleteFile({ directory: Directory.Documents, path: `${itemsDir}/${args.itemId}.${oldExt}` });
      } catch {
        // Ignore if file doesn't exist
      }
    }
  }

  // Use a timestamp suffix to guarantee a unique filename
  const timestamp = Date.now().toString(36);
  const filePath = `${itemsDir}/${args.itemId}_${timestamp}.${ext}`;

  // Convert to base64 in chunks to avoid stack overflow on large files
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  const base64Data = btoa(binary);

  await Filesystem.writeFile({
    directory: Directory.Documents,
    path: filePath,
    data: base64Data,
    recursive: true,
  });

  return filePath;
}

export async function getItemImageSrc(imagePath?: string): Promise<string | null> {
  if (!imagePath) return null;
  if (!Capacitor.isNativePlatform()) return null;
  const uri = await Filesystem.getUri({ directory: Directory.Documents, path: imagePath });
  return Capacitor.convertFileSrc(uri.uri);
}
