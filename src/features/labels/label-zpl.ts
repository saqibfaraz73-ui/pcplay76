/**
 * ZPL (Zebra Programming Language) label generation for Zebra label printers.
 * Generates ZPL II commands for barcode labels with product name, price, and Code128 barcode.
 */

interface LabelData {
  name: string;
  sku: string;
  price?: string;
}

/**
 * Build a single ZPL label command string.
 * Default label size: 50mm x 30mm (approx 400x240 dots at 203dpi)
 */
function buildLabelZpl(label: LabelData): string {
  const lines: string[] = [];

  lines.push("^XA");                    // Start format
  lines.push("^CI28");                  // UTF-8 encoding
  lines.push("^PW400");                 // Print width: 400 dots (~50mm at 203dpi)
  lines.push("^LL240");                 // Label length: 240 dots (~30mm)

  // Product name — centered, bold
  const name = label.name.slice(0, 30);
  lines.push("^FO10,15^A0N,28,28^FB380,1,0,C,0^FD" + name + "^FS");

  // Price — centered below name
  if (label.price && label.price !== "Rs 0") {
    lines.push("^FO10,50^A0N,24,24^FB380,1,0,C,0^FD" + label.price + "^FS");
  }

  // Barcode — Code128, centered
  const barcodeY = label.price && label.price !== "Rs 0" ? 85 : 60;
  lines.push(`^FO50,${barcodeY}^BY2,2,80^BCN,80,Y,N,N^FD${label.sku}^FS`);

  lines.push("^XZ");                    // End format

  return lines.join("\n");
}

/** Generate ZPL commands for multiple labels */
export function generateLabelsZpl(labels: LabelData[]): string {
  return labels.map(buildLabelZpl).join("\n");
}

/** Download ZPL as a .zpl file for sending to printer */
export function downloadLabelsZpl(labels: LabelData[]): void {
  const zpl = generateLabelsZpl(labels);
  const blob = new Blob([zpl], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `labels-${labels.length}.zpl`;
  a.click();
  URL.revokeObjectURL(url);
}
