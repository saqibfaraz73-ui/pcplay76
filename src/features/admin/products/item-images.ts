import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

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
 * Resize and compress an image file to max 800x800 pixels, JPEG/WebP ~80% quality.
 */
async function resizeAndCompress(file: File, maxDim = 800, quality = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

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
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create image canvas."));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const tryFormat = (mime: string, q: number): Promise<Blob | null> =>
        new Promise((res) => canvas.toBlob((b) => res(b), mime, q));

      (async () => {
        let blob = await tryFormat("image/webp", quality);
        let ext = "webp";

        if (!blob || blob.type !== "image/webp") {
          blob = await tryFormat("image/jpeg", quality);
          ext = "jpg";
        }

        if (!blob) {
          reject(new Error("Could not compress image."));
          return;
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
 * Uses app-private storage (Directory.Data) to avoid Android 6–10 runtime storage permission issues.
 */
const ITEM_IMAGES_DIR = "images/items";

/**
 * Saves image to app-private filesystem, auto-resizing large images to 800×800.
 * Returns relative file path to store on the item record.
 */
export async function saveItemImage(args: { itemId: string; file: File }): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Image upload is only available in the installed app (Android/iOS).");
  }

  let file = args.file;
  if (file.size > 100 * 1024) {
    file = await resizeAndCompress(file);
  }

  try {
    await Filesystem.mkdir({
      directory: Directory.Data,
      path: ITEM_IMAGES_DIR,
      recursive: true,
    });
  } catch {
    // ignore
  }

  // Delete ALL existing images for this item
  try {
    const listing = await Filesystem.readdir({ directory: Directory.Data, path: ITEM_IMAGES_DIR });
    for (const entry of listing.files) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (name.startsWith(args.itemId)) {
        try {
          await Filesystem.deleteFile({ directory: Directory.Data, path: `${ITEM_IMAGES_DIR}/${name}` });
        } catch {
          // ignore individual failures
        }
      }
    }
  } catch {
    const possibleExts = ["jpg", "png", "webp"];
    for (const oldExt of possibleExts) {
      try {
        await Filesystem.deleteFile({
          directory: Directory.Data,
          path: `${ITEM_IMAGES_DIR}/${args.itemId}.${oldExt}`,
        });
      } catch {
        // ignore missing file
      }
    }
  }

  const ext = safeExtFromFile(file);
  const timestamp = Date.now().toString(36);
  const filePath = `${ITEM_IMAGES_DIR}/${args.itemId}_${timestamp}.${ext}`;

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
    directory: Directory.Data,
    path: filePath,
    data: base64Data,
    recursive: true,
  });

  return filePath;
}

export async function getItemImageSrc(imagePath?: string): Promise<string | null> {
  if (!imagePath) return null;
  if (!Capacitor.isNativePlatform()) return null;

  // First try app-private storage (new), then Documents (legacy paths already saved in DB)
  const tryDirs: Directory[] = [Directory.Data, Directory.Documents];
  for (const dir of tryDirs) {
    try {
      const uri = await Filesystem.getUri({ directory: dir, path: imagePath });
      return Capacitor.convertFileSrc(uri.uri);
    } catch {
      // try next
    }
  }

  return null;
}
