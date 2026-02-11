import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

// Max width in dots: 58mm paper = 384 dots, 80mm = 576 dots
function getMaxDots(paperSize: "58" | "80"): number {
  return paperSize === "80" ? 576 : 384;
}

async function loadImageAsCanvas(
  imagePath: string,
  maxWidth: number
): Promise<HTMLCanvasElement> {
  return new Promise(async (resolve, reject) => {
    try {
      // Load from device filesystem
      const uri = await Filesystem.getUri({
        directory: Directory.Documents,
        path: imagePath,
      });
      const src = Capacitor.convertFileSrc(uri.uri);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // Scale to printer width while maintaining aspect ratio
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error("Failed to load logo image"));
      img.src = src;
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Convert canvas to ESC/POS GS v 0 raster bit image command.
 * Returns a string of raw bytes.
 */
function canvasToEscPosRaster(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imgData.data;

  const w = canvas.width;
  const h = canvas.height;
  const bytesPerRow = Math.ceil(w / 8);

  // Convert to monochrome bitmap (1 = black dot, 0 = white)
  const bitmap = new Uint8Array(bytesPerRow * h);

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const idx = (row * w + col) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];

      // Luminance threshold — dark enough = black dot
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const isBlack = a > 128 && luminance < 128;

      if (isBlack) {
        const byteIdx = row * bytesPerRow + Math.floor(col / 8);
        const bitIdx = 7 - (col % 8);
        bitmap[byteIdx] |= 1 << bitIdx;
      }
    }
  }

  // GS v 0 command: 0x1D 0x76 0x30 m xL xH yL yH [data]
  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = h & 0xff;
  const yH = (h >> 8) & 0xff;

  let result = String.fromCharCode(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH);
  for (let i = 0; i < bitmap.length; i++) {
    result += String.fromCharCode(bitmap[i]);
  }

  return result;
}

/**
 * Generate ESC/POS commands to print a logo image.
 * Centers the image and adds spacing after.
 */
export async function generateLogoEscPos(
  imagePath: string,
  paperSize: "58" | "80"
): Promise<string> {
  const maxDots = getMaxDots(paperSize);
  const canvas = await loadImageAsCanvas(imagePath, maxDots);

  // Center alignment
  let commands = "\x1b\x61\x01"; // ESC a 1 = center
  commands += canvasToEscPosRaster(canvas);
  commands += "\x1b\x61\x00"; // ESC a 0 = left align
  commands += "\n"; // spacing after logo

  return commands;
}
