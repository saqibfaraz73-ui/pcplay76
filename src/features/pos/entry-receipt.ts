import { formatIntMoney, fmtDateTime } from "@/features/pos/format";
import { isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { db } from "@/db/appDb";
import { sendToDefaultPrinter } from "@/features/pos/printer-routing";
import type { Settings, CounterId } from "@/db/schema";
import { sharePdfBytes } from "@/features/pos/share-utils";
import jsPDF from "jspdf";

/** Get and increment a sequential counter for arrivals or export sales */
export async function getNextEntryNo(counterId: CounterId): Promise<number> {
  return await db.transaction("rw", db.counters, async () => {
    const row = await db.counters.get(counterId);
    const next = row?.next ?? 1;
    await db.counters.put({ id: counterId, next: next + 1 });
    return next;
  });
}

export type EntryLine = {
  itemName: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  total: number;
};

export type EntryReceiptData = {
  type: "arrival" | "sale";
  receiptNo?: number;
  partyName: string;
  lines: EntryLine[];
  grandTotal: number;
  discountAmount?: number;
  advancePayment?: number;
  remainingBalance?: number;
  note?: string;
  date: Date;
};

/* ─── Receipt size (same logic as sales dashboard) ─── */

function getFeedLinesForSize(settings: Settings, contentLines: number): number {
  const lineHeightInch = 0.125;
  const sizeMap: Record<string, number> = {
    "2x2": 2,
    "2x3": 3,
    "2x4": 4,
    "2x5": 5,
  };
  const targetHeight = sizeMap[settings.receiptSize ?? "2x3"] ?? 3;
  const contentHeight = contentLines * lineHeightInch;
  const remainingInches = Math.max(0, targetHeight - contentHeight);
  const feedLines = Math.floor(remainingInches / lineHeightInch);
  return Math.max(3, feedLines);
}

/* ─── ESC/POS thermal print ─── */

function buildEscPos(data: EntryReceiptData, settings: Settings): string {
  const width = settings.paperSize === "80" ? 48 : 32;
  const hr = "-".repeat(width);
  const line = (s = "") => s.slice(0, width).padEnd(width, " ");
  const money = (n: number) => formatIntMoney(n);
  const title = settings.restaurantName || "SANGI POS";
  const label = data.type === "arrival" ? "SUPPLY ARRIVAL" : "EXPORT SALE";
  const dateStr = fmtDateTime(data.date.getTime());

  const headerLines = [
    line(title),
    settings.showAddress && settings.address ? line(settings.address) : null,
    settings.showPhone && settings.phone ? line(settings.phone) : null,
    line(label),
    data.receiptNo ? line(`Entry #: ${data.receiptNo}`) : null,
    hr,
    line(`Party: ${data.partyName}`),
    line(`Date: ${dateStr}`),
    hr,
  ].filter(Boolean) as string[];

  const itemLines: string[] = [];
  itemLines.push(
    "Item".padEnd(16) + "Qty".padStart(5) + "Total".padStart(width - 21)
  );
  itemLines.push(hr);

  for (const l of data.lines) {
    itemLines.push(
      (l.itemName || "—").slice(0, 16).padEnd(16) +
        String(l.qty).padStart(5) +
        money(l.total).padStart(width - 21)
    );
    if (l.unitPrice > 0 && l.qty > 0) {
      itemLines.push(line(`  ${l.qty} ${l.unit || "units"} × ${money(l.unitPrice)}`));
    }
  }

  const footerLines = [
    hr,
    line("Grand Total:".padEnd(width - money(data.grandTotal).length) + money(data.grandTotal)),
    ...(data.note ? [line(`Note: ${data.note}`)] : []),
    hr,
  ];

  const totalContentLines = headerLines.length + itemLines.length + footerLines.length;
  const feedCount = getFeedLinesForSize(settings, totalContentLines);

  return [
    "\x1b@",
    headerLines.join("\n"),
    itemLines.join("\n"),
    footerLines.join("\n"),
    "\n".repeat(feedCount),
    "\x1dV\x41\x03",
  ].join("\n");
}

export async function printEntryReceipt(data: EntryReceiptData) {
  const settings = await db.settings.get("app");

  if (isNativeAndroid()) {
    if (!settings) throw new Error("Printer not configured. Go to Admin > Printer.");
    const text = buildEscPos(data, settings);
    await sendToDefaultPrinter(settings, text);
    return;
  }

  // Browser fallback
  const label = data.type === "arrival" ? "Supply Arrival" : "Export Sale";
  const money = (n: number) => formatIntMoney(n);
  const linesHtml = data.lines
    .map(
      (l) => `<tr><td>${l.itemName || "—"}</td><td>${l.qty} ${l.unit || ""}</td><td>${money(l.unitPrice)}</td><td>${money(l.total)}</td></tr>`
    )
    .join("");

  const html = `<div style="font-family:monospace;max-width:320px;margin:auto;padding:16px">
    <div style="font-weight:bold;font-size:16px;margin-bottom:4px">${settings?.restaurantName || "SANGI POS"}</div>
    <div style="font-weight:bold;margin-bottom:4px">${label}</div>
    ${data.receiptNo ? `<div style="margin-bottom:4px">Entry #: ${data.receiptNo}</div>` : ""}
    <div>Party: ${data.partyName}</div>
    <div>Date: ${fmtDateTime(data.date.getTime())}</div>
    <hr/>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead><tr><th style="text-align:left">Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <hr/>
    <div style="font-weight:bold;font-size:14px;margin-top:8px">Grand Total: ${money(data.grandTotal)}</div>
    ${data.note ? `<div style="margin-top:4px">Note: ${data.note}</div>` : ""}
  </div>`;

  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head><title>${label}</title></head><body>${html}<script>window.onload=()=>window.print();</script></body></html>`);
  w.document.close();
}

/* ─── Share as PDF ─── */

export async function shareEntryReceipt(data: EntryReceiptData) {
  const settings = await db.settings.get("app");
  const restaurantName = settings?.restaurantName || "SANGI POS";
  const label = data.type === "arrival" ? "Supply Arrival" : "Export Sale";
  const money = (n: number) => formatIntMoney(n);

  const doc = new jsPDF({ unit: "pt", format: [226, 400 + data.lines.length * 30] }); // 80mm-ish width
  const left = 10;
  let y = 20;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(restaurantName, left, y);
  y += 14;
  doc.setFontSize(10);
  doc.text(label, left, y);
  y += 14;
  if (data.receiptNo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Entry #: ${data.receiptNo}`, left, y);
    y += 12;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Party: ${data.partyName}`, left, y);
  y += 12;
  doc.text(`Date: ${fmtDateTime(data.date.getTime())}`, left, y);
  y += 14;

  doc.setDrawColor(150);
  doc.line(left, y, 216, y);
  y += 10;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Item", left, y);
  doc.text("Qty", 100, y);
  doc.text("Price", 135, y);
  doc.text("Total", 180, y);
  y += 10;
  doc.line(left, y - 4, 216, y - 4);

  doc.setFont("helvetica", "normal");
  for (const l of data.lines) {
    doc.text((l.itemName || "—").slice(0, 18), left, y);
    doc.text(`${l.qty} ${l.unit || ""}`, 100, y);
    doc.text(money(l.unitPrice), 135, y);
    doc.text(money(l.total), 180, y);
    y += 12;
  }

  doc.line(left, y, 216, y);
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Grand Total: ${money(data.grandTotal)}`, left, y);
  y += 14;

  if ((data.discountAmount ?? 0) > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Discount: ${money(data.discountAmount!)}`, left, y);
    y += 12;
  }
  if ((data.advancePayment ?? 0) > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Advance Payment: ${money(data.advancePayment!)}`, left, y);
    y += 12;
  }
  if (data.remainingBalance != null) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Remaining Balance: ${money(data.remainingBalance)}`, left, y);
    y += 12;
  }

  if (data.note) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Note: ${data.note}`, left, y);
  }

  const safeName = data.partyName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
  const fileName = `${data.type}_${safeName}_${Date.now()}.pdf`;
  const bytes = doc.output("arraybuffer");
  await sharePdfBytes(new Uint8Array(bytes), fileName, `${label}: ${data.partyName}`);
}
