import jsPDF from "jspdf";
import QRCode from "qrcode";
import type { Settings } from "@/db/schema";
import { buildTaxQrPayload } from "./tax-qr";

type InvoiceData = {
  invoiceNo: string;
  buyerNtn: string;
  buyerCnic: string;
  buyerName: string;
  buyerPhone: string;
  lines: { name: string; qty: number; unitPrice: number; pctCode: string }[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  furtherTaxEnabled: boolean;
  furtherTaxPercent: number;
  furtherTax: number;
  grandTotal: number;
  createdAt: number;
};

export async function generateFbrInvoicePdf(data: InvoiceData, settings: Settings) {
  const doc = new jsPDF({ unit: "mm", format: [80, 200] });
  const w = 80;
  const curr = settings.currencySymbol || "Rs";
  let y = 6;

  // Header
  const bizName = settings.fbrBusinessName || settings.restaurantName || "Business";
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(bizName, w / 2, y, { align: "center" });
  y += 5;

  const addr = settings.fbrAddress || settings.address;
  if (addr) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(addr, w / 2, y, { align: "center" });
    y += 3.5;
  }

  const ph = settings.fbrPhone || settings.phone;
  if (ph) {
    doc.setFontSize(7);
    doc.text(`Tel: ${ph}`, w / 2, y, { align: "center" });
    y += 3.5;
  }

  const ntn = settings.fbrNtn || settings.taxApiBusinessNtn;
  if (ntn) {
    doc.setFontSize(7);
    doc.text(`NTN: ${ntn}`, w / 2, y, { align: "center" });
    y += 3.5;
  }

  const posId = settings.fbrPosId || settings.taxApiPosId;
  if (posId) {
    doc.setFontSize(7);
    doc.text(`POS ID: ${posId}`, w / 2, y, { align: "center" });
    y += 3.5;
  }

  // Title
  y += 1;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TAX INVOICE", w / 2, y, { align: "center" });
  y += 5;

  // Invoice details
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const dt = new Date(data.createdAt);
  doc.text(`Invoice #: ${data.invoiceNo}`, 4, y);
  y += 3.5;
  doc.text(`Date: ${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, 4, y);
  y += 3.5;

  // Buyer info
  if (data.buyerName) { doc.text(`Buyer: ${data.buyerName}`, 4, y); y += 3.5; }
  if (data.buyerNtn) { doc.text(`Buyer NTN: ${data.buyerNtn}`, 4, y); y += 3.5; }
  if (data.buyerCnic) { doc.text(`Buyer CNIC: ${data.buyerCnic}`, 4, y); y += 3.5; }
  if (data.buyerPhone) { doc.text(`Buyer Phone: ${data.buyerPhone}`, 4, y); y += 3.5; }

  // Line separator
  y += 1;
  doc.setDrawColor(0);
  doc.line(4, y, w - 4, y);
  y += 3;

  // Column headers
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("Item", 4, y);
  doc.text("Qty", 38, y, { align: "right" });
  doc.text("Price", 52, y, { align: "right" });
  doc.text("Total", w - 4, y, { align: "right" });
  y += 3;
  doc.line(4, y, w - 4, y);
  y += 3;

  // Items
  doc.setFont("helvetica", "normal");
  for (const l of data.lines) {
    if (!l.name) continue;
    const lineTotal = l.qty * l.unitPrice;
    doc.text(l.name.slice(0, 18), 4, y);
    doc.text(String(l.qty), 38, y, { align: "right" });
    doc.text(String(l.unitPrice), 52, y, { align: "right" });
    doc.text(String(lineTotal), w - 4, y, { align: "right" });
    y += 3;
    if (l.pctCode) {
      doc.setFontSize(5.5);
      doc.text(`PCT: ${l.pctCode}`, 6, y);
      doc.setFontSize(6.5);
      y += 2.5;
    }
  }

  // Totals
  y += 1;
  doc.line(4, y, w - 4, y);
  y += 3;
  doc.setFontSize(7);
  doc.text("Subtotal:", 4, y);
  doc.text(`${curr} ${data.subtotal}`, w - 4, y, { align: "right" });
  y += 3.5;

  if (data.taxPercent > 0) {
    doc.text(`${settings.taxLabel || "Tax"} (${data.taxPercent}%):`, 4, y);
    doc.text(`${curr} ${data.taxAmount}`, w - 4, y, { align: "right" });
    y += 3.5;
  }

  if (data.furtherTaxEnabled) {
    doc.text(`Further Tax (${data.furtherTaxPercent}%):`, 4, y);
    doc.text(`${curr} ${data.furtherTax}`, w - 4, y, { align: "right" });
    y += 3.5;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Grand Total:", 4, y);
  doc.text(`${curr} ${data.grandTotal}`, w - 4, y, { align: "right" });
  y += 5;

  // QR Code
  if (settings.taxApiEnabled && settings.taxApiBusinessNtn) {
    try {
      const qrPayload = buildTaxQrPayload({
        settings,
        receiptNo: data.invoiceNo,
        taxAmount: data.taxAmount + data.furtherTax,
        total: data.grandTotal,
        createdAt: data.createdAt,
      });
      const qrUrl = await QRCode.toDataURL(qrPayload, { width: 200, margin: 1, errorCorrectionLevel: "M" });
      doc.addImage(qrUrl, "PNG", w / 2 - 12, y, 24, 24);
      y += 26;
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.text("Scan to verify with FBR", w / 2, y, { align: "center" });
      y += 4;
    } catch { /* QR generation failed, skip */ }
  }

  // Footer
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text("This is a computer generated invoice", w / 2, y, { align: "center" });

  doc.save(`FBR_Invoice_${data.invoiceNo}.pdf`);
}
