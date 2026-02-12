import jsPDF from "jspdf";
import type { AdvanceOrder } from "@/db/booking-schema";
import { formatIntMoney, fmtDate, fmtDateTime, fmtTime12 } from "@/features/pos/format";

export function buildAdvanceLodgePdf(args: {
  restaurantName: string;
  fromLabel: string;
  toLabel: string;
  advanceOrders: AdvanceOrder[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 40;
  const right = pageWidth - 40;
  const contentWidth = right - left;
  let y = 48;
  const lineH = 14;
  const pageHeight = 780;

  const checkPage = (needed = lineH * 2) => {
    if (y + needed > pageHeight) { doc.addPage(); y = 48; }
  };

  const completed = args.advanceOrders.filter((o) => o.status !== "cancelled");
  const cancelled = args.advanceOrders.filter((o) => o.status === "cancelled");
  const pending = args.advanceOrders.filter((o) => o.status === "pending");
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const totalAdvance = completed.reduce((s, o) => s + o.advancePayment, 0);
  const totalRemaining = completed.reduce((s, o) => s + o.remainingPayment, 0);
  const totalDiscount = completed.reduce((s, o) => s + o.discountAmount, 0);

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Advance Orders Lodge", left, y);
  y += 20;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${args.restaurantName} • ${args.fromLabel} → ${args.toLabel}`, left, y);
  y += 20;

  // Summary boxes
  const summaryItems = [
    { label: "Total Orders", value: String(completed.length) },
    { label: "Pending", value: String(pending.length) },
    { label: "Total Revenue", value: formatIntMoney(totalRevenue) },
    { label: "Advance Received", value: formatIntMoney(totalAdvance) },
    { label: "Remaining Due", value: formatIntMoney(totalRemaining) },
  ];

  const cols = 5;
  const cellW = contentWidth / cols;
  const cellH = 36;

  for (let i = 0; i < summaryItems.length; i++) {
    const col = i % cols;
    const x = left + col * cellW;
    checkPage(cellH);
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.roundedRect(x + 2, y, cellW - 4, cellH - 4, 3, 3);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(summaryItems[i].label, x + 6, y + 12);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    if (summaryItems[i].label === "Remaining Due") {
      doc.setTextColor(totalRemaining > 0 ? 200 : 0, totalRemaining > 0 ? 50 : 150, totalRemaining > 0 ? 50 : 50);
    } else {
      doc.setTextColor(0);
    }
    doc.text(summaryItems[i].value, x + 6, y + 26);
    doc.setTextColor(0);
  }
  y += cellH + 12;

  if (totalDiscount > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Total Discount: ${formatIntMoney(totalDiscount)}`, left, y);
    y += 14;
  }
  if (cancelled.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 0, 0);
    doc.text(`Cancelled: ${cancelled.length} orders (${formatIntMoney(cancelled.reduce((s, o) => s + o.total, 0))})`, left, y);
    doc.setTextColor(0);
    y += 14;
  }

  // Detailed order list
  if (args.advanceOrders.length > 0) {
    checkPage(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Order Details", left, y);
    y += 16;

    const sorted = [...args.advanceOrders].sort((a, b) => a.createdAt - b.createdAt);
    for (const o of sorted) {
      const neededH = 50 + (o.customerName ? 12 : 0) + (o.deliveryDate ? 12 : 0) + (o.cancelledReason ? 12 : 0) + o.lines.length * 11;
      checkPage(neededH);

      const isCancelled = o.status === "cancelled";
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(isCancelled ? 180 : 0);
      const statusTag = o.status === "pending" ? " [PENDING]" : o.status === "cancelled" ? " [CANCELLED]" : " [COMPLETED]";
      doc.text(`Adv #${o.receiptNo}${statusTag}`, left, y);
      y += 12;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(isCancelled ? 150 : 60);
      doc.text(`Date: ${fmtDateTime(o.createdAt)}`, left + 8, y);
      y += 11;

      // Items
      for (const l of o.lines) {
        checkPage();
        if (l.qty && l.unitPrice) {
          doc.text(`• ${l.name}  —  ${l.qty} ${l.unit || "pcs"} x ${formatIntMoney(l.unitPrice)} = ${formatIntMoney(l.subtotal)}`, left + 8, y);
        } else {
          doc.text(`• ${l.name}${l.subtotal ? "  —  " + formatIntMoney(l.subtotal) : ""}`, left + 8, y);
        }
        y += 11;
      }

      doc.text(`Total: ${formatIntMoney(o.total)}  |  Advance: ${formatIntMoney(o.advancePayment)}  |  Remaining: ${formatIntMoney(o.remainingPayment)}`, left + 8, y);
      y += 11;

      if (o.discountAmount > 0) {
        doc.text(`Discount: ${formatIntMoney(o.discountAmount)}`, left + 8, y);
        y += 11;
      }

      if (o.customerName || o.customerPhone || o.customerAddress) {
        const parts = [o.customerName, o.customerPhone, o.customerAddress].filter(Boolean).join("  |  ");
        doc.text(`Customer: ${parts}`, left + 8, y);
        y += 11;
      }

      if (o.deliveryDate) {
        doc.text(`Delivery: ${fmtDate(o.deliveryDate)}${o.deliveryTime ? " " + fmtTime12(o.deliveryTime) : ""}`, left + 8, y);
        y += 11;
      }

      if (o.cancelledReason) {
        doc.setTextColor(200, 0, 0);
        doc.text(`Reason: ${o.cancelledReason}`, left + 8, y);
        doc.setTextColor(0);
        y += 11;
      }

      doc.setDrawColor(230);
      doc.line(left, y, right, y);
      y += 6;
    }
  }

  return doc;
}
