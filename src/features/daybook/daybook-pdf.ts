import jsPDF from "jspdf";
import { formatIntMoney, fmtDate, fmtDateTime } from "@/features/pos/format";
import type { DaybookEntry, DaybookAccount, DaybookImage } from "@/db/daybook-schema";

const LEFT = 40;
const PAGE_H = 780;
const LINE_H = 14;

function checkPage(doc: jsPDF, y: number, needed = LINE_H * 2): number {
  if (y + needed > PAGE_H) { doc.addPage(); return 48; }
  return y;
}

/** Spending PDF — only shows spending amount, source, screenshot, date/time. NO balances. */
export function buildSpendingSharePdf(
  entry: DaybookEntry,
  images: DaybookImage[],
  businessName: string,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const right = pageW - LEFT;
  let y = 48;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Spending Receipt", LEFT, y); y += 22;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(businessName, LEFT, y); y += 16;
  doc.text(`Date: ${fmtDateTime(entry.createdAt)}`, LEFT, y); y += 20;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Amount: ${formatIntMoney(entry.amount)}`, LEFT, y); y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Source: ${entry.accountName || "—"}`, LEFT, y); y += 14;
  if (entry.comment) {
    doc.text(`Note: ${entry.comment}`, LEFT, y); y += 14;
  }

  // Images
  for (const img of images) {
    y = checkPage(doc, y, 220);
    y += 10;
    try {
      doc.addImage(img.dataUrl, "JPEG", LEFT, y, right - LEFT, 200);
      y += 210;
    } catch { /* skip bad images */ }
  }

  return doc;
}

/** Date-range report PDF with full balance + spending details */
export function buildDaybookReportPdf(
  entries: DaybookEntry[],
  accounts: DaybookAccount[],
  fromLabel: string,
  toLabel: string,
  businessName: string,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const right = pageW - LEFT;
  let y = 48;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Daybook Report", LEFT, y); y += 22;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${businessName} • ${fromLabel} → ${toLabel}`, LEFT, y); y += 20;

  // Account balances
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Account Balances", LEFT, y); y += 16;

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  for (const acc of accounts) {
    y = checkPage(doc, y);
    const label = acc.type === "cash" ? acc.name : `${acc.name}${acc.accountNumber ? ` (${acc.accountNumber})` : ""}`;
    doc.text(`${label}: ${formatIntMoney(acc.balance)}`, LEFT + 10, y); y += LINE_H;
  }
  y = checkPage(doc, y);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Balance: ${formatIntMoney(totalBalance)}`, LEFT + 10, y); y += 20;

  // Chronological entries
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Transaction Details", LEFT, y); y += 16;

  // Table header
  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.text("#", LEFT + 4, y);
  doc.text("Type", LEFT + 24, y);
  doc.text("Source", LEFT + 80, y);
  doc.text("Amount", right - 140, y);
  doc.text("Date", right - 30, y, { align: "right" });
  y += 10;
  doc.setDrawColor(200);
  doc.line(LEFT, y - 4, right, y - 4);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");

  let runningBalance = totalBalance;
  // Reverse-compute: add back spendings, subtract payments to get starting balance
  // Actually just show entries in order
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);

  sorted.forEach((e, idx) => {
    y = checkPage(doc, y);
    doc.setFontSize(9);
    doc.text(String(idx + 1), LEFT + 4, y);
    doc.text(e.type === "payment" ? "Payment In" : "Spending", LEFT + 24, y);
    doc.text((e.accountName || "—").slice(0, 20), LEFT + 80, y);
    const sign = e.type === "payment" ? "+" : "-";
    doc.text(`${sign}${formatIntMoney(e.amount)}`, right - 140, y);
    doc.text(fmtDate(e.createdAt), right - 30, y, { align: "right" });
    y += LINE_H;
    if (e.comment) {
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(`  ${e.comment.slice(0, 60)}`, LEFT + 24, y);
      doc.setTextColor(0);
      y += 10;
    }
  });

  // Summary
  y = checkPage(doc, y, 60);
  y += 10;
  doc.setDrawColor(200);
  doc.line(LEFT, y, right, y); y += 14;

  const totalPayments = entries.filter(e => e.type === "payment").reduce((s, e) => s + e.amount, 0);
  const totalSpendings = entries.filter(e => e.type === "spending").reduce((s, e) => s + e.amount, 0);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Payments In: ${formatIntMoney(totalPayments)}`, LEFT, y); y += 14;
  doc.text(`Total Spendings: ${formatIntMoney(totalSpendings)}`, LEFT, y); y += 14;
  doc.text(`Current Total Balance: ${formatIntMoney(totalBalance)}`, LEFT, y);

  return doc;
}

/** Balance PDF for sharing — date range filtered */
export function buildBalancePdf(
  accounts: DaybookAccount[],
  entries: DaybookEntry[],
  fromLabel: string,
  toLabel: string,
  businessName: string,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 48;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Balance Summary", LEFT, y); y += 22;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${businessName} • ${fromLabel} → ${toLabel}`, LEFT, y); y += 20;

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  for (const acc of accounts) {
    const label = acc.type === "cash" ? acc.name : `${acc.name}${acc.accountNumber ? ` (${acc.accountNumber})` : ""}`;
    doc.text(`${label}: ${formatIntMoney(acc.balance)}`, LEFT, y); y += 16;
  }
  y += 4;
  doc.setFontSize(13);
  doc.text(`Total Balance: ${formatIntMoney(totalBalance)}`, LEFT, y);

  return doc;
}
