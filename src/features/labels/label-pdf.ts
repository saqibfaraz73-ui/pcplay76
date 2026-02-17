/**
 * Generate a PDF sheet of product labels with barcodes using jsPDF.
 */
import jsPDF from "jspdf";
import { barcodeToDataUrl } from "./barcode-generator";

interface LabelData {
  name: string;
  sku: string;
  price?: string;
}

/** Generate a PDF with barcode labels, 3 columns layout on A4 */
export function generateLabelPdf(labels: LabelData[]): void {
  const doc = buildLabelDoc(labels);
  doc.save("product-labels.pdf");
}

/** Generate a PDF blob (for sharing via native share API) */
export function generateLabelPdfBlob(labels: LabelData[]): Blob {
  const doc = buildLabelDoc(labels);
  return doc.output("blob");
}

function buildLabelDoc(labels: LabelData[]): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  const cols = 3;
  const labelW = 60;
  const labelH = 35;
  const marginX = (pageW - cols * labelW) / (cols + 1);
  const marginY = 10;
  const gapY = 5;
  const maxRows = Math.floor((297 - marginY * 2) / (labelH + gapY));

  let idx = 0;
  while (idx < labels.length) {
    if (idx > 0) doc.addPage();

    for (let row = 0; row < maxRows && idx < labels.length; row++) {
      for (let col = 0; col < cols && idx < labels.length; col++, idx++) {
        const label = labels[idx];
        const x = marginX + col * (labelW + marginX);
        const y = marginY + row * (labelH + gapY);

        doc.setDrawColor(200);
        doc.rect(x, y, labelW, labelH);

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        const name = label.name.length > 22 ? label.name.slice(0, 22) + "…" : label.name;
        doc.text(name, x + labelW / 2, y + 5, { align: "center" });

        if (label.price) {
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.text(label.price, x + labelW / 2, y + 9, { align: "center" });
        }

        try {
          const dataUrl = barcodeToDataUrl(label.sku, { width: 200, height: 40 });
          const barcodeY = label.price ? y + 11 : y + 8;
          doc.addImage(dataUrl, "PNG", x + 5, barcodeY, labelW - 10, 20);
        } catch {
          doc.setFontSize(6);
          doc.text("Barcode error", x + labelW / 2, y + 20, { align: "center" });
        }
      }
    }
  }

  return doc;
}
