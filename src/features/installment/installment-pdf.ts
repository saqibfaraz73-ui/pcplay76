import jsPDF from "jspdf";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import type { Settings } from "@/db/schema";
import { getCurrencySymbol } from "@/features/pos/format";
import { addTaxQrToPdf, shouldPrintTaxQr } from "@/features/tax/tax-qr";

function fmt(n: number): string {
  const cs = getCurrencySymbol();
  return cs ? `${cs} ${Math.round(n).toLocaleString()}` : Math.round(n).toLocaleString();
}

function fmtDt(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
}

export async function buildInstallmentReceiptPdf(args: {
  customer: InstallmentCustomer;
  payment: InstallmentPayment;
  settings: Settings | null;
}): Promise<jsPDF> {
  const { customer: c, payment: p, settings: s } = args;
  const doc = new jsPDF({ unit: "mm", format: [80, 150] });
  let y = 8;

  // Business header
  if (s?.restaurantName) {
    doc.setFontSize(12);
    doc.text(s.restaurantName, 40, y, { align: "center" });
    y += 5;
  }
  if (s?.address) { doc.setFontSize(7); doc.text(s.address, 40, y, { align: "center" }); y += 3; }
  if (s?.phone) { doc.setFontSize(7); doc.text(s.phone, 40, y, { align: "center" }); y += 3; }

  doc.setFontSize(10);
  y += 2;
  doc.text("INSTALLMENT RECEIPT", 40, y, { align: "center" });
  y += 5;

  doc.setFontSize(8);
  doc.text(`Receipt #: ${p.receiptNo ?? "-"}`, 5, y); y += 4;
  doc.text(`Date: ${fmtDt(p.createdAt)}`, 5, y); y += 4;
  doc.text(`Customer: ${c.name}`, 5, y); y += 4;
  doc.text(`Phone: ${c.phone}`, 5, y); y += 4;
  doc.text(`Product: ${c.productName}`, 5, y); y += 4;
  doc.text(`Month: ${p.month}`, 5, y); y += 5;

  // Line
  doc.setLineWidth(0.3);
  doc.line(5, y, 75, y);
  y += 4;

  doc.setFontSize(9);
  doc.text("Payment Amount:", 5, y);
  doc.text(fmt(p.amount), 75, y, { align: "right" });
  y += 4;

  if (p.lateFeeAmount) {
    doc.text("Late Fee:", 5, y);
    doc.text(fmt(p.lateFeeAmount), 75, y, { align: "right" });
    y += 4;
  }
  if (p.taxAmount) {
    doc.text("Tax:", 5, y);
    doc.text(fmt(p.taxAmount), 75, y, { align: "right" });
    y += 4;
  }
  if (p.lateFeeAmount || p.taxAmount) {
    const totalCollected = p.amount + (p.lateFeeAmount ?? 0) + (p.taxAmount ?? 0);
    doc.text("Total Collected:", 5, y);
    doc.text(fmt(totalCollected), 75, y, { align: "right" });
    y += 4;
  }

  doc.line(5, y, 75, y);
  y += 4;

  doc.text("Balance Before:", 5, y);
  doc.text(fmt(p.balanceBefore), 75, y, { align: "right" });
  y += 4;
  doc.setFontSize(10);
  doc.text("Balance After:", 5, y);
  doc.text(fmt(p.balanceAfter), 75, y, { align: "right" });
  y += 6;

  if (p.note) {
    doc.setFontSize(7);
    doc.text(`Note: ${p.note}`, 5, y);
    y += 4;
  }

  doc.setFontSize(7);
  doc.text(`Received by: ${p.agentName}`, 5, y);
  y += 6;
  doc.setFontSize(6);
  doc.text("Thank you for your payment!", 40, y, { align: "center" });

  return doc;
}

export function buildPaymentHistoryPdf(args: {
  customer: InstallmentCustomer;
  payments: InstallmentPayment[];
  settings: Settings | null;
}): jsPDF {
  const { customer: c, payments, settings: s } = args;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 15;

  // Header
  doc.setFontSize(14);
  if (s?.restaurantName) {
    doc.text(s.restaurantName, 105, y, { align: "center" });
    y += 6;
  }
  if (s?.address) { doc.setFontSize(8); doc.text(s.address, 105, y, { align: "center" }); y += 4; }
  if (s?.phone) { doc.setFontSize(8); doc.text(s.phone, 105, y, { align: "center" }); y += 4; }

  doc.setFontSize(12);
  y += 2;
  doc.text("PAYMENT HISTORY", 105, y, { align: "center" });
  y += 8;

  // Customer info
  doc.setFontSize(9);
  doc.text(`Customer: ${c.name}`, 15, y); doc.text(`Phone: ${c.phone}`, 120, y); y += 5;
  doc.text(`Product: ${c.productName}`, 15, y); doc.text(`Total Price: ${fmt(c.totalPrice)}`, 120, y); y += 5;
  doc.text(`Monthly Installment: ${fmt(c.monthlyInstallment)}`, 15, y); doc.text(`Balance: ${fmt(c.totalBalance)}`, 120, y); y += 7;

  // Table header
  doc.setFontSize(8);
  const cols = [15, 40, 75, 100, 130, 160, 185];
  doc.setFont("helvetica", "bold");
  doc.text("#", cols[0], y);
  doc.text("Date", cols[1], y);
  doc.text("Month", cols[2], y);
  doc.text("Amount", cols[3], y);
  doc.text("Late Fee", cols[4], y);
  doc.text("Balance", cols[5], y);
  y += 2;
  doc.line(15, y, 195, y);
  y += 4;
  doc.setFont("helvetica", "normal");

  for (const p of payments) {
    if (y > 275) { doc.addPage(); y = 15; }
    doc.text(String(p.receiptNo ?? "-"), cols[0], y);
    doc.text(fmtDt(p.createdAt), cols[1], y);
    doc.text(p.month, cols[2], y);
    doc.text(fmt(p.amount), cols[3], y);
    doc.text(p.lateFeeAmount ? fmt(p.lateFeeAmount) : "-", cols[4], y);
    doc.text(fmt(p.balanceAfter), cols[5], y);
    y += 5;
  }

  // Totals
  y += 3;
  doc.line(15, y, 195, y);
  y += 5;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalLateFee = payments.reduce((s, p) => s + (p.lateFeeAmount ?? 0), 0);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Paid: ${fmt(totalPaid)}`, 15, y);
  doc.text(`Total Late Fee: ${fmt(totalLateFee)}`, 100, y);
  y += 5;
  doc.text(`Remaining Balance: ${fmt(c.totalBalance)}`, 15, y);

  return doc;
}
