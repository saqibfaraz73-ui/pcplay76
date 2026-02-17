/**
 * TSPL (TSC Printer Language) label generation for TSC, Xprinter, and compatible label printers.
 * Generates TSPL commands for barcode labels with product name, price, and Code128 barcode.
 */

interface LabelData {
  name: string;
  sku: string;
  price?: string;
}

/**
 * Build a single TSPL label command string.
 * Default label size: 50mm x 30mm (approx 400x240 dots at 203dpi)
 */
function buildLabelTspl(label: LabelData): string {
  const lines: string[] = [];

  // Setup
  lines.push("SIZE 50 mm, 30 mm");
  lines.push("GAP 2 mm, 0 mm");
  lines.push("DIRECTION 1");
  lines.push("CLS");

  // Product name — centered
  const name = label.name.slice(0, 30);
  // TEXT x,y,"font",rotation,x-mul,y-mul,"content"
  // Center: label is 400 dots wide, estimate text width and center manually
  const nameX = Math.max(10, Math.floor((400 - name.length * 12) / 2));
  lines.push(`TEXT ${nameX},15,"3",0,1,1,"${name}"`);

  // Price
  if (label.price && label.price !== "Rs 0") {
    const priceX = Math.max(10, Math.floor((400 - label.price.length * 10) / 2));
    lines.push(`TEXT ${priceX},50,"2",0,1,1,"${label.price}"`);
  }

  // Barcode — Code128, centered
  const barcodeY = label.price && label.price !== "Rs 0" ? 80 : 55;
  // BARCODE x,y,"type",height,readable,rotation,narrow,wide,"content"
  lines.push(`BARCODE 60,${barcodeY},"128",70,1,0,2,4,"${label.sku}"`);

  lines.push("PRINT 1,1");

  return lines.join("\n");
}

/** Generate TSPL commands for multiple labels */
export function generateLabelsTspl(labels: LabelData[]): string {
  return labels.map(buildLabelTspl).join("\n");
}

/** Download TSPL as a .prn file for sending to printer */
export function downloadLabelsTspl(labels: LabelData[]): void {
  const tspl = generateLabelsTspl(labels);
  const blob = new Blob([tspl], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `labels-${labels.length}.prn`;
  a.click();
  URL.revokeObjectURL(url);
}
