import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

import { ensureSangiFolders, folderPath } from "@/features/files/sangi-folders";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

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
 * Saves image to device filesystem (Documents/Sangi Pos/Images/items/...).
 * Returns the file path to store on the item record.
 */
export async function saveItemImage(args: { itemId: string; file: File }): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Image upload is only available in the installed app (Android/iOS).");
  }

  // Enforce 100kb size limit
  if (args.file.size > 100 * 1024) {
    throw new Error("Image must be under 100 KB. Please compress or resize the image.");
  }

  await ensureSangiFolders();

  const ext = safeExtFromFile(args.file);
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
  const buffer = await args.file.arrayBuffer();
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
