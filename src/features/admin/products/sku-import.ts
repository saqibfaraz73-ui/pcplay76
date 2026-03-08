/**
 * SKU Import: detect barcodes from images, PDFs, ZPL, and TSPL files.
 */
import { Html5Qrcode } from "html5-qrcode";

/**
 * Upscale an image file to ensure minimum resolution for barcode detection.
 * Small or blurry barcodes often fail to scan — rendering at higher res helps.
 */
async function upscaleImageIfNeeded(file: File, minWidth = 800): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width >= minWidth) {
        URL.revokeObjectURL(img.src);
        resolve(file);
        return;
      }
      const scale = Math.ceil(minWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d")!;
      // Use pixelated rendering to keep barcode bars crisp
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name, { type: "image/png" }));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(file);
    };
    img.src = URL.createObjectURL(file);
  });
}

/** Extract barcode from an image file using html5-qrcode */
export async function detectBarcodeFromImage(file: File): Promise<string | null> {
  // Upscale small images for better detection
  const processedFile = await upscaleImageIfNeeded(file);
  
  const containerId = "sku-import-hidden-" + Date.now();
  const div = document.createElement("div");
  div.id = containerId;
  div.style.display = "none";
  document.body.appendChild(div);
  try {
    const qr = new Html5Qrcode(containerId);
    const result = await qr.scanFileV2(processedFile, /* showImage */ false);
    try { qr.clear(); } catch {}
    return result?.decodedText || null;
  } catch {
    return null;
  } finally {
    div.remove();
  }
}

/** Extract barcode data from ZPL content */
export function extractBarcodeFromZpl(content: string): string | null {
  // ZPL barcode commands: ^BC (Code 128), ^BE (EAN-13), ^B3 (Code 39), ^BY (barcode params)
  // The data follows on the next ^FD...^FS
  const patterns = [
    /\^B[C3ENI8U]\b[^]*?\^FD([^\^]+)\^FS/gi, // Common ZPL barcode commands
    /\^FD([0-9A-Za-z\-\.\/\+\s]{4,})\^FS/g,    // Any field data that looks like a barcode
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/** Extract barcode data from TSPL content */
export function extractBarcodeFromTspl(content: string): string | null {
  // TSPL barcode commands: BARCODE x,y,"type",... ,"data"
  const barcodeMatch = content.match(
    /BARCODE\s+\d+\s*,\s*\d+\s*,\s*"[^"]*"\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*"([^"]+)"/i
  );
  if (barcodeMatch?.[1]) return barcodeMatch[1].trim();

  // Simpler TSPL format
  const simpleMatch = content.match(/BARCODE[^"]*"([^"]+)"/i);
  if (simpleMatch?.[1]) return simpleMatch[1].trim();

  return null;
}

/** Convert a PDF page to an image using canvas (first page only) */
async function pdfPageToImageFile(file: File): Promise<File | null> {
  try {
    // Use browser's built-in rendering via an object URL + canvas
    // We'll render PDF to image using an iframe approach
    const arrayBuffer = await file.arrayBuffer();
    
    // Try using pdfjsLib if available, otherwise fall back
    // For simplicity, we'll create an image from the PDF using a canvas approach
    // We need to dynamically load pdf.js
    const pdfjsScript = document.createElement("script");
    pdfjsScript.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    
    await new Promise<void>((resolve, reject) => {
      pdfjsScript.onload = () => resolve();
      pdfjsScript.onerror = () => reject(new Error("Failed to load PDF.js"));
      document.head.appendChild(pdfjsScript);
    });

    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) return null;
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 3 }); // high res for barcode detection

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) return null;
    return new File([blob], "pdf-page.png", { type: "image/png" });
  } catch {
    return null;
  }
}

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

  // PDF files - convert first page to image then scan
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const imgFile = await pdfPageToImageFile(file);
    if (!imgFile) return null;
    return detectBarcodeFromImage(imgFile);
  }

  // Image files
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)$/.test(name)) {
    return detectBarcodeFromImage(file);
  }

  return null;
}
