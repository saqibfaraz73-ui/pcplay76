/**
 * SKU Import: detect barcodes from images, PDFs, ZPL, and TSPL files.
 * Multi-strategy scanning: Native BarcodeDetector → Custom Code128 decoder → html5-qrcode fallback.
 */
import { Html5Qrcode } from "html5-qrcode";
import { decodeAppGeneratedCode128FromCanvas } from "@/features/labels/code128-canvas-decode";
import { findSkusFromAppLabelPdfTextChunks } from "@/features/labels/pdf-item-name-sku-fallback";

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

    // Upscale small images for better detection
    const needsUpscale = base.width < 800;
    const upscaled = needsUpscale ? upscaleCanvas(base, Math.ceil(800 / base.width)) : base;

    const threshold = makeThresholdCanvas(upscaled);
    const variants = [upscaled, threshold, rotateCanvas(upscaled, 90), rotateCanvas(upscaled, 270)];

    // Strategy 1: Custom Code128 decoder (best for our own barcodes)
    for (const variant of variants) {
      const directCode = decodeAppGeneratedCode128FromCanvas(variant);
      if (directCode && isLikelyBarcode(directCode)) {
        found.add(directCode);
      }
    }
    // Also try threshold variant
    if (found.size === 0) {
      const threshVariants = [makeThresholdCanvas(base)];
      if (needsUpscale) threshVariants.push(threshold);
      for (const v of threshVariants) {
        const code = decodeAppGeneratedCode128FromCanvas(v);
        if (code && isLikelyBarcode(code)) found.add(code);
      }
    }

    // Strategy 2: Native BarcodeDetector API
    if (found.size === 0) {
      for (const variant of variants) {
        const codes = await scanWithNativeBarcodeDetector(variant);
        for (const code of codes) found.add(code);
      }
    }
  } catch {
    // fallback below
  }

  // Strategy 3: html5-qrcode fallback
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
  const barcodeMatch = content.match(
    /BARCODE\s+\d+\s*,\s*\d+\s*,\s*"[^"]*"\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*"([^"]+)"/i
  );
  if (barcodeMatch?.[1]) return barcodeMatch[1].trim();

  const simpleMatch = content.match(/BARCODE[^"]*"([^"]+)"/i);
  if (simpleMatch?.[1]) return simpleMatch[1].trim();

  return null;
}

/* ──────────────── PDF barcode scanning ──────────────── */

function extractLikelyBarcodesFromText(rawText: string): string[] {
  const results: string[] = [];
  const tokens = rawText.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    if (!isLikelyBarcode(token)) continue;
    if (/^[A-Za-z]+$/.test(token)) continue;
    if (/^\d{1,4}$/.test(token)) continue;
    if (/[A-Za-z]/.test(token) && /\d/.test(token)) { results.push(token); continue; }
    if (/^\d{8,14}$/.test(token)) { results.push(token); continue; }
  }
  let m: RegExpExecArray | null;
  const labelled = /(?:barcode|sku|ean|upc|code)\s*[:#-]?\s*([A-Za-z0-9\-_.]{3,64})/gi;
  while ((m = labelled.exec(rawText)) !== null) {
    const t = m[1]?.trim();
    if (t && /\d/.test(t) && isLikelyBarcode(t) && !results.includes(t)) results.push(t);
  }
  return sortBarcodeCandidates(results);
}

function cropCanvasRegion(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement | null {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.floor(Math.min(w, src.width - sx));
  const sh = Math.floor(Math.min(h, src.height - sy));
  if (sw <= 0 || sh <= 0) return null;
  const out = document.createElement("canvas");
  out.width = sw; out.height = sh;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

async function renderPdfPageToCanvas(page: any, scale: number): Promise<HTMLCanvasElement | null> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** Scan known A4 label layout regions for barcodes */
async function scanBarcodesFromKnownA4LabelLayout(
  pageCanvas: HTMLCanvasElement,
  pageNum: number,
): Promise<string[]> {
  const found = new Set<string>();
  const pageWmm = 210, pageHmm = 297;
  const cols = 3, labelW = 60, labelH = 35;
  const marginX = (pageWmm - cols * labelW) / (cols + 1);
  const marginY = 10, gapY = 5;
  const maxRows = Math.floor((pageHmm - marginY * 2) / (labelH + gapY));
  const pxPerMmX = pageCanvas.width / pageWmm;
  const pxPerMmY = pageCanvas.height / pageHmm;

  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = marginX + col * (labelW + marginX);
      const y = marginY + row * (labelH + gapY);

      for (const barcodeTopMm of [y + 11, y + 8]) {
        const regionX = (x + 4.5) * pxPerMmX;
        const regionW = (labelW - 9) * pxPerMmX;
        const regionY = barcodeTopMm * pxPerMmY;
        const regionH = 20 * pxPerMmY;

        const crop = cropCanvasRegion(pageCanvas, regionX, regionY, regionW, regionH);
        if (!crop) continue;

        const upscaled = upscaleCanvas(crop, 2.2);
        const threshold = makeThresholdCanvas(upscaled);

        // Try custom decoder first
        const directCode = decodeAppGeneratedCode128FromCanvas(threshold);
        if (directCode && isLikelyBarcode(directCode)) {
          found.add(directCode);
          continue;
        }

        // Try native BarcodeDetector
        const nativeCodes = await scanWithNativeBarcodeDetector(threshold);
        for (const code of nativeCodes) {
          if (isLikelyBarcode(code)) found.add(code);
        }
      }
    }
  }
  return sortBarcodeCandidates([...found]);
}

async function scanBarcodesFromPdf(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const results: string[] = [];
  const textChunks: string[] = [];
  const maxPages = Math.min(pdf.numPages, 4);

  // Pass 1: text extraction
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    try {
      const textContent = await page.getTextContent();
      const pageStrings = (textContent.items || [])
        .map((item: any) => String(item?.str || "").trim())
        .filter(Boolean);
      textChunks.push(...pageStrings);
      const text = pageStrings.join(" ");
      const candidates = extractLikelyBarcodesFromText(text);
      for (const code of candidates) {
        if (!results.includes(code)) results.push(code);
      }
    } catch { /* ignore */ }
  }
  if (results.length > 0) return sortBarcodeCandidates(results);

  // Pass 1.5: match text chunks to known menu items
  const knownSkuMatches = await findSkusFromAppLabelPdfTextChunks(textChunks);
  for (const sku of knownSkuMatches) {
    if (!results.includes(sku)) results.push(sku);
  }
  if (results.length > 0) return sortBarcodeCandidates(results);

  // Pass 2: scan barcode image regions from known A4 layout
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const canvas = await renderPdfPageToCanvas(page, 4.0);
    if (!canvas) continue;
    const templateCodes = await scanBarcodesFromKnownA4LabelLayout(canvas, pageNum);
    for (const code of templateCodes) {
      if (!results.includes(code)) results.push(code);
    }
  }

  return sortBarcodeCandidates(results);
}

/* ──────────────── Main entry point ──────────────── */

/**
 * Import a file and extract barcode/SKU from it.
 * Supports: images (png, jpg, webp, bmp), PDF, ZPL, TSPL text files.
 */
export async function importSkuFromFile(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  const type = file.type;

  // ZPL files
  if (name.endsWith(".zpl")) {
    const text = await file.text();
    return extractBarcodeFromZpl(text);
  }

  // TSPL files
  if (name.endsWith(".tspl") || name.endsWith(".tsc")) {
    const text = await file.text();
    return extractBarcodeFromTspl(text);
  }

  // Plain text that might be ZPL or TSPL
  if (type === "text/plain" || name.endsWith(".txt")) {
    const text = await file.text();
    const zpl = extractBarcodeFromZpl(text);
    if (zpl) return zpl;
    const tspl = extractBarcodeFromTspl(text);
    if (tspl) return tspl;
    return null;
  }

  // PDF files - multi-strategy scan
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const barcodes = await scanBarcodesFromPdf(file);
      return barcodes[0] ?? null;
    } catch {
      return null;
    }
  }

  // Image files - multi-strategy scan
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)$/.test(name)) {
    return detectBarcodeFromImage(file);
  }

  return null;
}
