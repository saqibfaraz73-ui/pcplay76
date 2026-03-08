/**
 * SKU Import: detect barcodes from images, ZPL, and TSPL files.
 * Multi-strategy scanning: Custom Code128 decoder → Native BarcodeDetector → html5-qrcode fallback.
 */
import { Html5Qrcode } from "html5-qrcode";
import { decodeAppGeneratedCode128FromCanvas } from "@/features/labels/code128-canvas-decode";

/* ──────────────── Helpers ──────────────── */

function isLikelyBarcode(value: string): boolean {
  const v = value.trim();
  return /^[A-Za-z0-9\-_.]+$/.test(v) && v.length >= 3 && v.length <= 64;
}

function barcodeCandidateScore(value: string): number {
  const v = value.trim();
  if (!isLikelyBarcode(v)) return -999;
  let score = 0;
  if (/^\d{8,14}$/.test(v)) score += 120;
  else if (/^\d{4,7}$/.test(v)) score += 55;
  if (/[A-Za-z]/.test(v) && /\d/.test(v)) score += 95;
  if (/^[A-Za-z]+$/.test(v)) score -= 40;
  if (v.length >= 6 && v.length <= 24) score += 15;
  if (/^\d{1,3}$/.test(v)) score -= 90;
  if (/^(item|name|product|price|total|qty|burger|pizza|rice|tea)$/i.test(v)) score -= 120;
  return score;
}

function sortBarcodeCandidates(values: string[]): string[] {
  const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return unique.sort((a, b) => barcodeCandidateScore(b) - barcodeCandidateScore(a));
}

/* ──────────────── Canvas utilities ──────────────── */

function makeThresholdCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);
  try {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const val = gray < 135 ? 0 : 255;
      data[i] = val; data[i + 1] = val; data[i + 2] = val;
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* ignore */ }
  return canvas;
}

function rotateCanvas(src: HTMLCanvasElement, degrees: 90 | 270): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = src.height;
  canvas.height = src.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return canvas;
}

function upscaleCanvas(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.floor(src.width * factor));
  out.height = Math.max(1, Math.floor(src.height * factor));
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

/* ──────────────── Native BarcodeDetector ──────────────── */

async function scanWithNativeBarcodeDetector(canvas: HTMLCanvasElement): Promise<string[]> {
  try {
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) return [];
    let detector: any;
    try {
      detector = new BarcodeDetectorCtor({
        formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar"],
      });
    } catch {
      detector = new BarcodeDetectorCtor();
    }
    const detected = await detector.detect(canvas);
    return (detected || [])
      .map((d: any) => String(d?.rawValue || "").trim())
      .filter((v: string) => isLikelyBarcode(v));
  } catch {
    return [];
  }
}

/* ──────────────── html5-qrcode fallback ──────────────── */

function ensureScratchDiv(): string {
  const id = "sku-import-scratch";
  if (!document.getElementById(id)) {
    const div = document.createElement("div");
    div.id = id;
    div.style.display = "none";
    document.body.appendChild(div);
  }
  return id;
}

async function scanWithHtml5Qrcode(file: File): Promise<string | null> {
  try {
    const divId = ensureScratchDiv();
    const qr = new Html5Qrcode(divId, false);
    const result = await qr.scanFileV2(file, false);
    await qr.clear();
    return result?.decodedText?.trim() || null;
  } catch {
    return null;
  }
}

/** Convert a canvas to a File for html5-qrcode */
async function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (!blob) return null;
  return new File([blob], name, { type: "image/png" });
}

/* ──────────────── Image barcode scanning (multi-strategy) ──────────────── */

async function scanBarcodesFromImageFile(file: File): Promise<string[]> {
  const found = new Set<string>();

  try {
    const bitmap = await createImageBitmap(file);
    const base = document.createElement("canvas");
    base.width = bitmap.width;
    base.height = bitmap.height;
    const ctx = base.getContext("2d");
    if (ctx) ctx.drawImage(bitmap, 0, 0);

    // Upscale small images with nearest-neighbor for crisp bars
    const needsUpscale = base.width < 800;
    const scaleFactor = needsUpscale ? Math.ceil(800 / base.width) : 1;
    const upscaled = needsUpscale ? upscaleCanvas(base, scaleFactor) : base;

    const threshold = makeThresholdCanvas(upscaled);
    const thresholdBase = makeThresholdCanvas(base);

    // Build variants: original, threshold, rotated
    const allVariants = [
      upscaled, threshold, thresholdBase,
      rotateCanvas(upscaled, 90), rotateCanvas(upscaled, 270),
      rotateCanvas(threshold, 90), rotateCanvas(threshold, 270),
    ];
    // Also try higher upscale for very small images
    if (base.width < 400) {
      const bigUpscale = upscaleCanvas(base, Math.ceil(1200 / base.width));
      allVariants.push(bigUpscale, makeThresholdCanvas(bigUpscale));
    }

    // Strategy 1: Custom Code128 decoder (best for our own barcodes)
    for (const variant of allVariants) {
      const directCode = decodeAppGeneratedCode128FromCanvas(variant);
      if (directCode && isLikelyBarcode(directCode)) {
        found.add(directCode);
        break; // our decoder matched — high confidence
      }
    }

    // Strategy 2: Native BarcodeDetector API
    if (found.size === 0) {
      for (const variant of allVariants) {
        const codes = await scanWithNativeBarcodeDetector(variant);
        for (const code of codes) found.add(code);
        if (found.size > 0) break;
      }
    }

    // Strategy 3: html5-qrcode on upscaled canvas (works better than raw file for small images)
    if (found.size === 0) {
      // Try upscaled threshold canvas first
      const upscaledFile = await canvasToFile(threshold, "scan.png");
      if (upscaledFile) {
        const legacy = await scanWithHtml5Qrcode(upscaledFile);
        if (legacy && isLikelyBarcode(legacy)) found.add(legacy);
      }
    }
  } catch {
    // fallback below
  }

  // Strategy 4: html5-qrcode on original file
  if (found.size === 0) {
    const legacy = await scanWithHtml5Qrcode(file);
    if (legacy && isLikelyBarcode(legacy)) found.add(legacy);
  }

  return sortBarcodeCandidates([...found]);
}

/** Extract barcode from an image file — returns best match */
export async function detectBarcodeFromImage(file: File): Promise<string | null> {
  const barcodes = await scanBarcodesFromImageFile(file);
  return barcodes[0] ?? null;
}

/* ──────────────── ZPL parser ──────────────── */

export function extractBarcodeFromZpl(content: string): string | null {
  const results: string[] = [];
  const fdPattern = /\^FD([^^]+)\^FS/gi;
  const lines = content.split(/\^XA|\^XZ/).join("\n");
  const barcodeBlocks = lines.split(/(\^B[A-Z])/i);
  for (let i = 1; i < barcodeBlocks.length; i += 2) {
    const block = barcodeBlocks[i] + (barcodeBlocks[i + 1] ?? "");
    const match = fdPattern.exec(block);
    if (match?.[1]) results.push(match[1].trim());
    fdPattern.lastIndex = 0;
  }
  if (results.length === 0) {
    let m: RegExpExecArray | null;
    const fallback = /\^FD([^^]+)\^FS/gi;
    while ((m = fallback.exec(content)) !== null) {
      const val = m[1].trim();
      if (/^[A-Za-z0-9\-_.]+$/.test(val) && val.length >= 3) results.push(val);
    }
  }
  return results[0] ?? null;
}

/* ──────────────── TSPL parser ──────────────── */

export function extractBarcodeFromTspl(content: string): string | null {
  const results: string[] = [];
  let m: RegExpExecArray | null;

  // Flexible pattern: BARCODE followed by params and quoted content
  // Matches: BARCODE 60,80,"128",70,1,0,2,4,"SKU-VALUE"
  // Also: BARCODE x,y,"type",h,r,rot,n,w,"content"
  const pattern = /BARCODE\s+[^"]*"[^"]*"[^"]*"([^"]+)"/gi;
  while ((m = pattern.exec(content)) !== null) {
    const val = m[1]?.trim();
    if (val && val.length >= 1) results.push(val);
  }

  // Fallback: grab the last quoted string after BARCODE keyword
  if (results.length === 0) {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (!/BARCODE/i.test(line)) continue;
      // Find all quoted strings in the line
      const quotes = [...line.matchAll(/"([^"]+)"/g)].map((q) => q[1]);
      // The last quoted string is typically the barcode content
      if (quotes.length >= 2) {
        const last = quotes[quotes.length - 1].trim();
        if (last.length >= 1) results.push(last);
      }
    }
  }

  return results[0] ?? null;
}

/* ──────────────── Main entry point ──────────────── */

/**
 * Import a file and extract barcode/SKU from it.
 * Supports: images (png, jpg, webp, bmp), ZPL, TSPL text files.
 */
export async function importSkuFromFile(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  const type = file.type;

  // ZPL files
  if (name.endsWith(".zpl") || name.endsWith(".zpl.txt")) {
    const text = await file.text();
    return extractBarcodeFromZpl(text);
  }

  // TSPL files (.tspl, .tsc, .prn)
  if (name.endsWith(".tspl") || name.endsWith(".tsc") || name.endsWith(".prn") || name.endsWith(".tspl.txt")) {
    const text = await file.text();
    return extractBarcodeFromTspl(text);
  }

  // Plain text that might be ZPL or TSPL
  if (type === "text/plain" || name.endsWith(".txt")) {
    const text = await file.text();
    // Auto-detect ZPL
    if (text.includes("^XA") || text.includes("^FD")) {
      const zpl = extractBarcodeFromZpl(text);
      if (zpl) return zpl;
    }
    // Auto-detect TSPL
    if (/BARCODE\s/i.test(text)) {
      const tspl = extractBarcodeFromTspl(text);
      if (tspl) return tspl;
    }
    // Try both anyway
    const zpl = extractBarcodeFromZpl(text);
    if (zpl) return zpl;
    const tspl = extractBarcodeFromTspl(text);
    if (tspl) return tspl;
    return null;
  }

  // Image files - multi-strategy scan
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)$/.test(name)) {
    return detectBarcodeFromImage(file);
  }

  return null;
}
