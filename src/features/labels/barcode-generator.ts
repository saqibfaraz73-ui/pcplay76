/**
 * Code128B barcode generator — pure TypeScript, no dependencies.
 * Renders crisp, scannable barcodes using integer-pixel bar widths.
 */

const CODE128B_START = 104;
const CODE128_STOP = 106;

const PATTERNS: number[][] = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],
];
const STOP_PATTERN = [2,3,3,1,1,1,2];

function encodeCode128B(text: string): number[] {
  const values: number[] = [CODE128B_START];
  for (let i = 0; i < text.length; i++) {
    const v = text.charCodeAt(i) - 32;
    if (v < 0 || v > 95) continue;
    values.push(v);
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) {
    sum += values[i] * i;
  }
  values.push(sum % 103);
  values.push(CODE128_STOP);
  return values;
}

/** Count the total number of modules (thin-bar units) in the encoded barcode */
function countModules(values: number[]): number {
  let total = 0;
  for (let vi = 0; vi < values.length; vi++) {
    const pattern = vi === values.length - 1 ? STOP_PATTERN : PATTERNS[values[vi]];
    for (let pi = 0; pi < pattern.length; pi++) {
      total += pattern[pi];
    }
  }
  return total;
}

/**
 * Render a Code128B barcode to a canvas element.
 * Uses integer module widths for crisp, scannable output.
 * Minimal quiet zone (5 modules) to maximize barcode size within canvas.
 */
export function renderBarcodeToCanvas(
  text: string,
  opts?: { width?: number; height?: number; showText?: boolean }
): HTMLCanvasElement {
  const { width = 300, height = 80, showText = true } = opts ?? {};
  const values = encodeCode128B(text);

  // Small quiet zone — just enough for scanners (5 modules each side)
  const quietZoneModules = 5;
  const dataModules = countModules(values);
  const totalModules = dataModules + quietZoneModules * 2;

  // Calculate module width — use integer pixels, minimum 2px per module for thick bars
  const moduleWidth = Math.max(2, Math.floor(width / totalModules));
  const actualWidth = totalModules * moduleWidth;

  const canvas = document.createElement("canvas");
  const textH = showText ? 18 : 0;
  canvas.width = actualWidth;
  canvas.height = height + textH;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw bars with exact integer positions
  let x = quietZoneModules * moduleWidth;
  ctx.fillStyle = "#000";

  for (let vi = 0; vi < values.length; vi++) {
    const pattern = vi === values.length - 1 ? STOP_PATTERN : PATTERNS[values[vi]];
    for (let pi = 0; pi < pattern.length; pi++) {
      const isBar = pi % 2 === 0;
      const w = pattern[pi] * moduleWidth;
      if (isBar) {
        ctx.fillRect(x, 0, w, height);
      }
      x += w;
    }
  }

  if (showText) {
    ctx.fillStyle = "#000";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, actualWidth / 2, height + 14);
  }

  return canvas;
}

/**
 * Convert barcode to base64 PNG data URL.
 * Renders at native resolution (no 2x upscale) to match the compact
 * output of the working reference app (≈400×100px).
 */
export function barcodeToDataUrl(text: string, opts?: { width?: number; height?: number }): string {
  const canvas = renderBarcodeToCanvas(text, {
    width: opts?.width ?? 300,
    height: opts?.height ?? 80,
  });
  return canvas.toDataURL("image/png");
}
