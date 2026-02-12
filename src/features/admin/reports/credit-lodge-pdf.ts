import jsPDF from "jspdf";
import type { CreditCustomer, CreditPayment, Order } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";

function toDateLabel(ts: number) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Build PDF that matches the in-app CreditLodgePreview layout */
export function buildCreditLodgePdf(args: {
  restaurantName: string;
  fromLabel: string;
  toLabel: string;
  customer: CreditCustomer;
  orders: Order[];
  payments: CreditPayment[];
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
    if (y + needed > pageHeight) {
      doc.addPage();
      y = 48;
    }
  };

  const completed = args.orders.filter((o) => o.status === "completed");
  const cancelled = args.orders.filter((o) => o.status === "cancelled");
  const totalCredit = completed.reduce((s, o) => s + o.total, 0);
  const totalPaid = args.payments.reduce((s, p) => s + p.amount, 0);
  const balance = totalCredit - totalPaid;

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Credit Customer Lodge", left, y);
  y += 20;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${args.restaurantName} • ${args.customer.name}${args.customer.mobile ? ` (${args.customer.mobile})` : ""} • ${args.fromLabel} → ${args.toLabel}`,
    left,
    y
  );
  y += 20;

  // Summary cards (5 columns)
  const summaryItems = [
    { label: "Completed", value: String(completed.length) },
    { label: "Cancelled", value: String(cancelled.length) },
    { label: "Total Credit", value: formatIntMoney(totalCredit) },
    { label: "Total Paid", value: formatIntMoney(totalPaid) },
    { label: "Balance Due", value: formatIntMoney(balance) },
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
    doc.text(summaryItems[i].label, x + 8, y + 12);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    // Color-code balance
    if (summaryItems[i].label === "Balance Due") {
      doc.setTextColor(balance > 0 ? 200 : 0, balance > 0 ? 50 : 150, balance > 0 ? 50 : 50);
    } else if (summaryItems[i].label === "Total Paid") {
      doc.setTextColor(0, 150, 50);
    } else {
      doc.setTextColor(0);
    }
    doc.text(summaryItems[i].value, x + 8, y + 26);
    doc.setTextColor(0);
  }

  y += cellH + 16;

  // Payment History
  if (args.payments.length > 0) {
    checkPage(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Payment History", left, y);
    y += 16;

    // Table header
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("Date", left + 4, y);
    doc.text("Amount", left + contentWidth * 0.5, y);
    doc.text("Note", left + contentWidth * 0.7, y);
    y += 10;
    doc.setDrawColor(200);
    doc.line(left, y - 4, right, y - 4);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);

    const sortedPayments = [...args.payments].sort((a, b) => b.createdAt - a.createdAt);
    for (const p of sortedPayments) {
      checkPage();
      doc.setFontSize(9);
      doc.text(new Date(p.createdAt).toLocaleString(), left + 4, y);
      doc.setTextColor(0, 150, 50);
      doc.text(`+${formatIntMoney(p.amount)}`, left + contentWidth * 0.5, y);
      doc.setTextColor(0);
      doc.text(p.note || "—", left + contentWidth * 0.7, y);
      y += lineH;
    }
    y += 8;
  }

  // Items summary
  const byItem: Record<string, { name: string; qty: number; total: number }> = {};
  for (const o of completed) {
    for (const l of o.lines) {
      const existing = byItem[l.itemId];
      byItem[l.itemId] = {
        name: l.name,
        qty: (existing?.qty ?? 0) + l.qty,
        total: (existing?.total ?? 0) + l.subtotal,
      };
    }
  }
  const itemsSummary = Object.values(byItem).sort((a, b) => b.total - a.total);

  if (itemsSummary.length > 0) {
    checkPage(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Items", left, y);
    y += 16;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("Item", left + 4, y);
    doc.text("Qty", left + contentWidth * 0.6, y);
    doc.text("Total", left + contentWidth * 0.8, y);
    y += 10;
    doc.setDrawColor(200);
    doc.line(left, y - 4, right, y - 4);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    for (const r of itemsSummary) {
      checkPage();
      doc.setFontSize(9);
      doc.text(r.name, left + 4, y);
      doc.text(String(r.qty), left + contentWidth * 0.6, y);
      doc.text(formatIntMoney(r.total), left + contentWidth * 0.8, y);
      y += lineH;
    }
    y += 8;
  }

  // Order list
  if (args.orders.length > 0) {
    checkPage(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Orders", left, y);
    y += 16;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("Receipt", left + 4, y);
    doc.text("Date", left + contentWidth * 0.15, y);
    doc.text("Status", left + contentWidth * 0.55, y);
    doc.text("Total", left + contentWidth * 0.75, y);
    y += 10;
    doc.setDrawColor(200);
    doc.line(left, y - 4, right, y - 4);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);

    const sorted = [...args.orders].sort((a, b) => a.createdAt - b.createdAt);
    for (const o of sorted) {
      checkPage();
      doc.setFontSize(9);
      doc.text(String(o.receiptNo), left + 4, y);
      doc.text(new Date(o.createdAt).toLocaleString(), left + contentWidth * 0.15, y);
      doc.text(o.status.toUpperCase(), left + contentWidth * 0.55, y);
      doc.text(formatIntMoney(o.total), left + contentWidth * 0.75, y);
      y += lineH;
    }
  }

  return doc;
}

/** Build PDF with only payment history for a credit customer */
export function buildCreditPaymentsPdf(args: {
  restaurantName: string;
  fromLabel: string;
  toLabel: string;
  customer: CreditCustomer;
  orders: Order[];
  payments: CreditPayment[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 40;
  const right = pageWidth - 40;
  const contentWidth = right - left;
  let y = 48;
  const lineH = 14;
  const pageHeight = 780;
  const checkPage = (needed = lineH * 2) => { if (y + needed > pageHeight) { doc.addPage(); y = 48; } };

  const completed = args.orders.filter((o) => o.status === "completed");
  const totalCredit = completed.reduce((s, o) => s + o.total, 0);
  const totalPaid = args.payments.reduce((s, p) => s + p.amount, 0);
  const balance = totalCredit - totalPaid;

  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("Credit Payment History", left, y); y += 20;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`${args.restaurantName} • ${args.customer.name}${args.customer.mobile ? ` (${args.customer.mobile})` : ""} • ${args.fromLabel} → ${args.toLabel}`, left, y); y += 20;

  // Summary
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
  doc.text(`Total Credit: ${formatIntMoney(totalCredit)}`, left, y);
  doc.text(`Total Paid: ${formatIntMoney(totalPaid)}`, left + 180, y);
  doc.setTextColor(balance > 0 ? 200 : 0, balance > 0 ? 50 : 150, balance > 0 ? 50 : 50);
  doc.text(`Balance: ${formatIntMoney(balance)}`, left + 340, y);
  doc.setTextColor(0); y += 20;

  if (args.payments.length === 0) {
    doc.setFontSize(10); doc.text("No payments in this period.", left, y);
    return doc;
  }

  // Table header
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
  doc.text("#", left + 4, y); doc.text("Date", left + 20, y); doc.text("Amount", left + contentWidth * 0.5, y); doc.text("Note", left + contentWidth * 0.7, y); y += 10;
  doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
  doc.setFont("helvetica", "normal"); doc.setTextColor(0);

  const sorted = [...args.payments].sort((a, b) => b.createdAt - a.createdAt);
  sorted.forEach((p, idx) => {
    checkPage();
    doc.setFontSize(9);
    doc.text(String(idx + 1), left + 4, y);
    doc.text(new Date(p.createdAt).toLocaleString(), left + 20, y);
    doc.setTextColor(0, 150, 50);
    doc.text(`+${formatIntMoney(p.amount)}`, left + contentWidth * 0.5, y);
    doc.setTextColor(0);
    doc.text(p.note || "—", left + contentWidth * 0.7, y);
    y += lineH;
  });

  // Grand total
  y += 8;
  doc.setDrawColor(0); doc.line(left, y, right, y); y += 14;
  doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text("Total Payments:", left, y); doc.text(formatIntMoney(totalPaid), right, y, { align: "right" });

  return doc;
}

/** Build PDF with items bought by a credit customer */
export function buildCreditItemsPdf(args: {
  restaurantName: string;
  fromLabel: string;
  toLabel: string;
  customer: CreditCustomer;
  orders: Order[];
  payments: CreditPayment[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 40;
  const right = pageWidth - 40;
  const contentWidth = right - left;
  let y = 48;
  const lineH = 14;
  const pageHeight = 780;
  const checkPage = (needed = lineH * 2) => { if (y + needed > pageHeight) { doc.addPage(); y = 48; } };

  const completed = args.orders.filter((o) => o.status === "completed");
  const totalCredit = completed.reduce((s, o) => s + o.total, 0);
  const totalPaid = args.payments.reduce((s, p) => s + p.amount, 0);
  const balance = totalCredit - totalPaid;

  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("Credit Items Report", left, y); y += 20;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`${args.restaurantName} • ${args.customer.name}${args.customer.mobile ? ` (${args.customer.mobile})` : ""} • ${args.fromLabel} → ${args.toLabel}`, left, y); y += 20;

  // Summary
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
  doc.text(`Total Credit: ${formatIntMoney(totalCredit)}`, left, y);
  doc.text(`Paid: ${formatIntMoney(totalPaid)}`, left + 180, y);
  doc.setTextColor(balance > 0 ? 200 : 0, balance > 0 ? 50 : 150, balance > 0 ? 50 : 50);
  doc.text(`Balance: ${formatIntMoney(balance)}`, left + 310, y);
  doc.setTextColor(0); y += 20;

  // Items summary
  const byItem: Record<string, { name: string; qty: number; total: number }> = {};
  for (const o of completed) {
    for (const l of o.lines) {
      const existing = byItem[l.itemId];
      byItem[l.itemId] = { name: l.name, qty: (existing?.qty ?? 0) + l.qty, total: (existing?.total ?? 0) + l.subtotal };
    }
  }
  const itemsSummary = Object.values(byItem).sort((a, b) => b.total - a.total);

  if (itemsSummary.length === 0) {
    doc.setFontSize(10); doc.text("No items in this period.", left, y);
    return doc;
  }

  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
  doc.text("#", left + 4, y); doc.text("Item", left + 20, y); doc.text("Qty", left + contentWidth * 0.55, y); doc.text("Unit Price", left + contentWidth * 0.68, y); doc.text("Total", left + contentWidth * 0.85, y); y += 10;
  doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
  doc.setFont("helvetica", "normal"); doc.setTextColor(0);

  itemsSummary.forEach((r, idx) => {
    checkPage();
    doc.setFontSize(9);
    doc.text(String(idx + 1), left + 4, y);
    doc.text(r.name, left + 20, y);
    doc.text(String(r.qty), left + contentWidth * 0.55, y);
    doc.text(r.qty > 0 ? formatIntMoney(Math.round(r.total / r.qty)) : "—", left + contentWidth * 0.68, y);
    doc.text(formatIntMoney(r.total), left + contentWidth * 0.85, y);
    y += lineH;
  });

  // Grand total
  y += 8;
  doc.setDrawColor(0); doc.line(left, y, right, y); y += 14;
  doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text("Grand Total:", left, y); doc.text(formatIntMoney(totalCredit), right, y, { align: "right" });

  return doc;
}
