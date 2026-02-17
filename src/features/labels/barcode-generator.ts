/**
 * Code128B barcode generator — pure TypeScript, no dependencies.
 * Produces barcode as array of bar widths or renders to canvas.
 */

// Code128B character set (values 0–106)
const CODE128B_START = 104;
const CODE128_STOP = 106;

// Encoding patterns: each value maps to 6 alternating bar/space widths
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
const STOP_PATTERN = [2,3,3,1,1,1,2]; // stop + termination bar

function encodeCode128B(text: string): number[] {
  const values: number[] = [CODE128B_START];
  for (let i = 0; i < text.length; i++) {
    const v = text.charCodeAt(i) - 32;
    if (v < 0 || v > 95) continue; // skip unsupported chars
    values.push(v);
  }
  // Checksum
  let sum = values[0];
  for (let i = 1; i < values.length; i++) {
    sum += values[i] * i;
  }
  values.push(sum % 103);
  values.push(CODE128_STOP);
  return values;
}

/** Render a Code128B barcode to a canvas element and return it */
export function renderBarcodeToCanvas(
  text: string,
  opts?: { width?: number; height?: number; showText?: boolean }
): HTMLCanvasElement {
  const { width = 300, height = 80, showText = true } = opts ?? {};
  const values = encodeCode128B(text);

  // Build binary bar array
  const bars: boolean[] = [];
  // Quiet zone
  for (let i = 0; i < 10; i++) bars.push(false);

  for (let vi = 0; vi < values.length; vi++) {
    const pattern = vi === values.length - 1 ? STOP_PATTERN : PATTERNS[values[vi]];
    for (let pi = 0; pi < pattern.length; pi++) {
      const isBar = pi % 2 === 0;
      for (let w = 0; w < pattern[pi]; w++) bars.push(isBar);
    }
  }
  // Quiet zone
  for (let i = 0; i < 10; i++) bars.push(false);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  const textH = showText ? 18 : 0;
  canvas.height = height + textH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const barWidth = width / bars.length;
  ctx.fillStyle = "#000";
  for (let i = 0; i < bars.length; i++) {
    if (bars[i]) {
      ctx.fillRect(i * barWidth, 0, Math.ceil(barWidth), height);
    }
  }

  if (showText) {
    ctx.fillStyle = "#000";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, width / 2, height + 14);
  }

  return canvas;
}

/** Convert barcode canvas to base64 PNG data URL */
export function barcodeToDataUrl(text: string, opts?: { width?: number; height?: number }): string {
  const canvas = renderBarcodeToCanvas(text, opts);
  return canvas.toDataURL("image/png");
}
