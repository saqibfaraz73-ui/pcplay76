import jsPDF from "jspdf";
import type { CreditCustomer, CreditPayment, Order } from "@/db/schema";
import { formatIntMoney, fmtDateTime, fmtDate } from "@/features/pos/format";

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
      doc.text(fmtDateTime(p.createdAt), left + 4, y);
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
      doc.text(fmtDateTime(o.createdAt), left + contentWidth * 0.15, y);
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
  const lineH = 16;
  const pageHeight = 780;
  const checkPage = (needed = lineH * 2) => { if (y + needed > pageHeight) { doc.addPage(); y = 48; } };

  const completed = args.orders.filter((o) => o.status === "completed");
  const totalCredit = completed.reduce((s, o) => s + o.total, 0);
  const totalPaid = args.payments.reduce((s, p) => s + p.amount, 0);
  const currentBalance = totalCredit - totalPaid;

  // Title
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("Credit Payment History", left, y); y += 20;

  // Customer info
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`${args.restaurantName}`, left, y); y += 14;
  doc.setFont("helvetica", "bold");
  doc.text(`Customer: ${args.customer.name}${args.customer.mobile ? ` (${args.customer.mobile})` : ""}`, left, y); y += 14;
  doc.setFont("helvetica", "normal");
  doc.text(`Date Range: ${args.fromLabel} → ${args.toLabel}`, left, y); y += 16;

  // Current balance box
  checkPage(40);
  doc.setDrawColor(150); doc.setLineWidth(0.5);
  doc.roundedRect(left, y, contentWidth, 36, 3, 3);
  doc.setFontSize(9); doc.setTextColor(80); doc.text("Current Balance", left + 8, y + 12);
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.setTextColor(currentBalance > 0 ? 200 : 0, currentBalance > 0 ? 50 : 150, currentBalance > 0 ? 50 : 50);
  doc.text(formatIntMoney(currentBalance), left + 8, y + 28);
  doc.setTextColor(0);

  // Summary in same box
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(80);
  doc.text(`Total Credit: ${formatIntMoney(totalCredit)}`, left + contentWidth * 0.4, y + 12);
  doc.text(`Total Paid: ${formatIntMoney(totalPaid)}`, left + contentWidth * 0.4, y + 26);
  doc.setTextColor(0);
  y += 48;

  if (args.payments.length === 0) {
    doc.setFontSize(10); doc.text("No payments in this period.", left, y);
    return doc;
  }

  // Combine payments and orders chronologically to show running balance
  // Sort payments oldest first so running balance makes sense
  const sorted = [...args.payments].sort((a, b) => a.createdAt - b.createdAt);

  // Calculate balance before first payment in range using all orders/payments
  // We compute running balance: start from 0, add credits, subtract payments in chronological order
  const allEvents: { type: "credit" | "payment"; amount: number; createdAt: number }[] = [];
  for (const o of completed) allEvents.push({ type: "credit", amount: o.total, createdAt: o.createdAt });
  for (const p of args.payments) allEvents.push({ type: "payment", amount: p.amount, createdAt: p.createdAt });
  allEvents.sort((a, b) => a.createdAt - b.createdAt);

  // Table header
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
  doc.text("#", left + 4, y);
  doc.text("Date", left + 18, y);
  doc.text("Amount", left + contentWidth * 0.38, y);
  doc.text("Balance After", left + contentWidth * 0.58, y);
  doc.text("Note", left + contentWidth * 0.78, y);
  y += 10;
  doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
  doc.setFont("helvetica", "normal"); doc.setTextColor(0);

  // Calculate running balance for each payment
  let runningBal = 0;
  const balanceMap = new Map<string, number>();
  for (const ev of allEvents) {
    if (ev.type === "credit") runningBal += ev.amount;
    else runningBal -= ev.amount;
    // For payments, store the balance after
    const matchingPayment = sorted.find((p) => p.createdAt === ev.createdAt && ev.type === "payment" && !balanceMap.has(p.id));
    if (matchingPayment && ev.type === "payment") balanceMap.set(matchingPayment.id, runningBal);
  }

  // Re-sort for display (newest first)
  const displaySorted = [...sorted].reverse();
  displaySorted.forEach((p, idx) => {
    checkPage();
    const balAfter = balanceMap.get(p.id) ?? 0;
    doc.setFontSize(8); doc.setTextColor(0);
    doc.text(String(idx + 1), left + 4, y);
    doc.text(fmtDateTime(p.createdAt), left + 18, y);
    doc.setTextColor(0, 150, 50);
    doc.text(`+${formatIntMoney(p.amount)}`, left + contentWidth * 0.38, y);
    doc.setTextColor(balAfter > 0 ? 200 : 0, balAfter > 0 ? 50 : 150, balAfter > 0 ? 50 : 50);
    doc.text(formatIntMoney(balAfter), left + contentWidth * 0.58, y);
    doc.setTextColor(0);
    doc.text((p.note || "—").slice(0, 20), left + contentWidth * 0.78, y);
    y += lineH;
  });

  // Grand total
  y += 8;
  doc.setDrawColor(0); doc.line(left, y, right, y); y += 14;
  doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text("Total Payments:", left, y); doc.text(formatIntMoney(totalPaid), right, y, { align: "right" });

  return doc;
}

/** Build PDF with items bought (purchases) by a credit customer with running balance */
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
  const lineH = 16;
  const pageHeight = 780;
  const checkPage = (needed = lineH * 2) => { if (y + needed > pageHeight) { doc.addPage(); y = 48; } };

  const completed = args.orders.filter((o) => o.status === "completed");
  const totalCredit = completed.reduce((s, o) => s + o.total, 0);
  const totalPaid = args.payments.reduce((s, p) => s + p.amount, 0);
  const currentBalance = totalCredit - totalPaid;

  // Title
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("Credit Purchases Report", left, y); y += 20;

  // Customer info
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`${args.restaurantName}`, left, y); y += 14;
  doc.setFont("helvetica", "bold");
  doc.text(`Customer: ${args.customer.name}${args.customer.mobile ? ` (${args.customer.mobile})` : ""}`, left, y); y += 14;
  doc.setFont("helvetica", "normal");
  doc.text(`Date Range: ${args.fromLabel} → ${args.toLabel}`, left, y); y += 16;

  // Current balance box
  checkPage(40);
  doc.setDrawColor(150); doc.setLineWidth(0.5);
  doc.roundedRect(left, y, contentWidth, 36, 3, 3);
  doc.setFontSize(9); doc.setTextColor(80); doc.text("Current Balance", left + 8, y + 12);
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.setTextColor(currentBalance > 0 ? 200 : 0, currentBalance > 0 ? 50 : 150, currentBalance > 0 ? 50 : 50);
  doc.text(formatIntMoney(currentBalance), left + 8, y + 28);
  doc.setTextColor(0);

  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(80);
  doc.text(`Total Credit: ${formatIntMoney(totalCredit)}`, left + contentWidth * 0.4, y + 12);
  doc.text(`Total Paid: ${formatIntMoney(totalPaid)}`, left + contentWidth * 0.4, y + 26);
  doc.setTextColor(0);
  y += 48;

  if (completed.length === 0) {
    doc.setFontSize(10); doc.text("No purchases in this period.", left, y);
    return doc;
  }

  // Build running balance for each order
  const allEvents: { type: "credit" | "payment"; amount: number; createdAt: number; id: string }[] = [];
  for (const o of completed) allEvents.push({ type: "credit", amount: o.total, createdAt: o.createdAt, id: o.id });
  for (const p of args.payments) allEvents.push({ type: "payment", amount: p.amount, createdAt: p.createdAt, id: p.id });
  allEvents.sort((a, b) => a.createdAt - b.createdAt);

  let runningBal = 0;
  const balanceMap = new Map<string, number>();
  for (const ev of allEvents) {
    if (ev.type === "credit") runningBal += ev.amount;
    else runningBal -= ev.amount;
    balanceMap.set(ev.id, runningBal);
  }

  // Purchase orders with item details (newest first)
  const sortedOrders = [...completed].sort((a, b) => b.createdAt - a.createdAt);

  sortedOrders.forEach((o, idx) => {
    const balAfter = balanceMap.get(o.id) ?? 0;
    const neededLines = o.lines.length * 12 + 50;
    checkPage(neededLines);

    // Order header
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text(`${idx + 1}. Order #${o.receiptNo}`, left, y);
    doc.text(fmtDateTime(o.createdAt), left + 120, y);
    doc.text(`Bill: ${formatIntMoney(o.total)}`, left + contentWidth * 0.6, y);
    doc.setTextColor(balAfter > 0 ? 200 : 0, balAfter > 0 ? 50 : 150, balAfter > 0 ? 50 : 50);
    doc.text(`Bal: ${formatIntMoney(balAfter)}`, left + contentWidth * 0.82, y);
    doc.setTextColor(0);
    y += 12;

    // Item detail header
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(100);
    doc.text("Item", left + 12, y);
    doc.text("Price", left + contentWidth * 0.5, y);
    doc.text("Qty", left + contentWidth * 0.68, y);
    doc.text("Subtotal", left + contentWidth * 0.82, y);
    y += 9;
    doc.setDrawColor(220); doc.line(left + 10, y - 4, right, y - 4);

    // Item rows
    doc.setFont("helvetica", "normal"); doc.setTextColor(0); doc.setFontSize(8);
    for (const l of o.lines) {
      checkPage(12);
      doc.text(l.name.slice(0, 28), left + 12, y);
      doc.text(formatIntMoney(l.unitPrice), left + contentWidth * 0.5, y);
      doc.text(String(l.qty), left + contentWidth * 0.68, y);
      doc.text(formatIntMoney(l.subtotal), left + contentWidth * 0.82, y);
      y += 12;
    }

    // Order total line
    doc.setDrawColor(200); doc.line(left + 10, y - 2, right, y - 2);
    y += 8;
  });

  // Items summary section
  y += 10;
  checkPage(40);
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
  doc.text("Items Summary", left, y); y += 14;

  const byItem: Record<string, { name: string; qty: number; total: number }> = {};
  for (const o of completed) {
    for (const l of o.lines) {
      const existing = byItem[l.itemId];
      byItem[l.itemId] = { name: l.name, qty: (existing?.qty ?? 0) + l.qty, total: (existing?.total ?? 0) + l.subtotal };
    }
  }
  const itemsSummary = Object.values(byItem).sort((a, b) => b.total - a.total);

  doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
  doc.text("#", left + 4, y); doc.text("Item", left + 20, y); doc.text("Qty", left + contentWidth * 0.5, y); doc.text("Avg Price", left + contentWidth * 0.65, y); doc.text("Total", left + contentWidth * 0.85, y); y += 10;
  doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
  doc.setFont("helvetica", "normal"); doc.setTextColor(0);

  itemsSummary.forEach((r, idx) => {
    checkPage();
    doc.setFontSize(8);
    doc.text(String(idx + 1), left + 4, y);
    doc.text(r.name, left + 20, y);
    doc.text(String(r.qty), left + contentWidth * 0.5, y);
    doc.text(r.qty > 0 ? formatIntMoney(Math.round(r.total / r.qty)) : "—", left + contentWidth * 0.65, y);
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
