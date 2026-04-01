import type { Settings } from "@/db/schema";
import type { AdvanceOrder, BookingOrder } from "@/db/booking-schema";
import { formatIntMoney, fmtDate, fmtDateTime, fmtTime12 } from "@/features/pos/format";
import { isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { db } from "@/db/appDb";
import { isDuplicatePrint } from "@/features/pos/print-dedup";
import { sendToDefaultPrinter } from "@/features/pos/printer-routing";
import { buildTaxQrEscPos, addTaxQrToPdf, shouldPrintTaxQr } from "@/features/tax/tax-qr";
import { getTaxLabel } from "@/features/tax/tax-calc";
import jsPDF from "jspdf";

/* ─── Receipt size feed (same logic as sales) ─── */

function getFeedLinesForSize(settings: Settings, contentLines: number): number {
  const lineHeightInch = 0.125;
  const sizeMap: Record<string, number> = { "2x2": 2, "2x3": 3, "2x4": 4, "2x5": 5 };
  const targetHeight = sizeMap[settings.receiptSize ?? "2x3"] ?? 3;
  const contentHeight = contentLines * lineHeightInch;
  const remainingInches = Math.max(0, targetHeight - contentHeight);
  return Math.max(3, Math.floor(remainingInches / lineHeightInch));
}

/* ─── Advance Order Receipt (classic format) ─── */

function buildAdvanceEscPos(order: AdvanceOrder, settings: Settings): string {
  const width = settings.paperSize === "80" ? 48 : 32;
  const hr = "-".repeat(width);
  const line = (s = "") => s.slice(0, width).padEnd(width, " ");
  const money = (n: number) => formatIntMoney(n);
  const title = settings.restaurantName || "SANGI POS";
  const dateStr = fmtDateTime(order.createdAt);
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";
  const lr = (l: string, r: string) => l.padEnd(width - r.length) + r;

  const headerLines = [
    CENTER_ON,
    title,
    settings.showAddress && settings.address ? settings.address : null,
    settings.showPhone && settings.phone ? settings.phone : null,
    "ADVANCE ORDER",
    `Receipt #: ${order.receiptNo}`,
    LEFT_ON,
    hr,
    line(`Date: ${dateStr}`),
    order.cashier ? line(`Cashier: ${order.cashier}`) : null,
    order.customerName ? line(`Customer: ${order.customerName}`) : null,
    order.customerPhone ? line(`Phone: ${order.customerPhone}`) : null,
    order.customerAddress ? line(`Address: ${order.customerAddress}`) : null,
    order.deliveryDate ? line(`Delivery: ${fmtDate(order.deliveryDate)}${order.deliveryTime ? " " + fmtTime12(order.deliveryTime) : ""}`) : null,
    hr,
  ].filter(Boolean) as string[];

  const itemLines: string[] = [];
  for (const l of order.lines) {
    if (l.qty && l.unitPrice) {
      itemLines.push(line(`${l.name}`));
      itemLines.push(line(`  ${l.qty} ${l.unit || "pcs"} x ${money(l.unitPrice)} = ${money(l.subtotal)}`));
    } else {
      itemLines.push(line(`${l.name}${l.subtotal ? "  " + money(l.subtotal) : ""}`));
    }
  }

  const taxLabel = getTaxLabel(settings);
  const footerLines = [
    hr,
    lr("Subtotal:", money(order.subtotal)),
    order.discountAmount > 0 ? lr("Discount:", money(order.discountAmount)) : null,
    (order.taxAmount ?? 0) > 0 ? lr(`${taxLabel}:`, money(order.taxAmount!)) : null,
    lr("Total:", money(order.total)),
    lr("Advance:", money(order.advancePayment)),
    lr("Remaining:", money(order.remainingPayment)),
    hr,
  ].filter(Boolean) as string[];

  const taxQr = buildTaxQrEscPos({
    settings, receiptNo: order.receiptNo,
    taxAmount: order.taxAmount ?? 0, total: order.total, createdAt: order.createdAt,
  });

  const totalContentLines = headerLines.length + itemLines.length + footerLines.length;
  const feedCount = getFeedLinesForSize(settings, totalContentLines);

  return "\x1b@\x1b3\x14" + headerLines.join("\n") + "\n" + itemLines.join("\n") + "\n" + footerLines.join("\n") + taxQr + "\n".repeat(feedCount) + "\x1dV\x41\x03";
}

/* ─── Advance Order KOT ─── */

function buildAdvanceKot(order: AdvanceOrder, settings: Settings): string {
  const WIDTH = settings.paperSize === "80" ? 48 : 32;
  const hr = "-".repeat(WIDTH);
  const money = (n: number) => formatIntMoney(n);
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";
  const lr = (l = "", r = "") => { const sp = WIDTH - l.length - r.length; return l + " ".repeat(Math.max(1, sp)) + r; };

  const now = new Date();
  const timeStr = fmtTime12(now.toTimeString().slice(0, 5));

  const nameW = WIDTH - 16;
  const out: string[] = ["\x1b@\x1b3\x18" + CENTER_ON];
  out.push("KITCHEN ORDER");
  out.push(hr);
  out.push(`Adv #: ${order.receiptNo}`);
  if (order.cashier) out.push(`By: ${order.cashier}`);
  if (order.customerName) out.push(`Customer: ${order.customerName}`);
  out.push(timeStr);
  out.push(LEFT_ON);
  out.push(hr);

  // Items with qty and price
  out.push("Item".padEnd(nameW) + "Qty".padStart(5) + "Total".padStart(11));
  out.push(hr);
  for (const l of order.lines) {
    out.push(l.name.slice(0, nameW).padEnd(nameW) + String(l.qty || "").padStart(5) + money(l.subtotal).padStart(11));
  }

  out.push(hr);
  if ((order.taxAmount ?? 0) > 0) out.push(lr(`${getTaxLabel(settings)}:`, money(order.taxAmount!)));
  out.push(lr("Total:", money(order.total)));
  out.push(lr("Advance:", money(order.advancePayment)));
  out.push(lr("Remaining:", money(order.remainingPayment)));
  out.push(hr);
  out.push("");
  out.push("");
  out.push("");
  out.push("\x1dV\x41\x03");
  return out.join("\n");
}

/* ─── Booking Receipt (classic format) ─── */

function buildBookingEscPos(order: BookingOrder, settings: Settings): string {
  const width = settings.paperSize === "80" ? 48 : 32;
  const hr = "-".repeat(width);
  const line = (s = "") => s.slice(0, width).padEnd(width, " ");
  const money = (n: number) => formatIntMoney(n);
  const title = settings.restaurantName || "SANGI POS";
  const dateStr = fmtDate(order.date);
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";
  const lr = (l: string, r: string) => l.padEnd(width - r.length) + r;

  const headerLines = [
    CENTER_ON,
    title,
    settings.showAddress && settings.address ? settings.address : null,
    settings.showPhone && settings.phone ? settings.phone : null,
    (order.label === "Appointment" ? "APPOINTMENT" : "BOOKING"),
    `Receipt #: ${order.receiptNo}`,
    LEFT_ON,
    hr,
    line(`Item: ${order.bookableItemName}`),
    order.pricingType === "per_head" ? line(`Heads: ${order.headCount} × ${money(order.perHeadPrice ?? 0)}`) : null,
    line(`Date: ${dateStr}`),
    line(`Time: ${order.startTime} - ${order.endTime}`),
    line(`Duration: ${order.durationHours}h`),
    order.cashier ? line(`Cashier: ${order.cashier}`) : null,
    order.customerName ? line(`Customer: ${order.customerName}`) : null,
    order.customerPhone ? line(`Phone: ${order.customerPhone}`) : null,
    hr,
  ].filter(Boolean) as string[];

  const taxLabel = getTaxLabel(settings);
  const footerLines = [
    lr("Price:", money(order.price)),
    order.discountAmount > 0 ? lr("Discount:", money(order.discountAmount)) : null,
    (order.taxAmount ?? 0) > 0 ? lr(`${taxLabel}:`, money(order.taxAmount!)) : null,
    lr("Total:", money(order.total)),
    lr("Advance:", money(order.advancePayment)),
    lr("Remaining:", money(order.remainingPayment)),
    hr,
  ].filter(Boolean) as string[];

  const taxQr = buildTaxQrEscPos({
    settings, receiptNo: order.receiptNo,
    taxAmount: order.taxAmount ?? 0, total: order.total, createdAt: order.createdAt,
  });

  const totalContentLines = headerLines.length + footerLines.length;
  const feedCount = getFeedLinesForSize(settings, totalContentLines);

  return "\x1b@\x1b3\x14" + headerLines.join("\n") + "\n" + footerLines.join("\n") + taxQr + "\n".repeat(feedCount) + "\x1dV\x41\x03";
}

/* ─── Generic send helper ─── */

async function sendToPrinter(text: string) {
  // Dedup: prevent duplicate prints from rapid taps or retries
  if (isDuplicatePrint(text)) return;

  const settings = await db.settings.get("app");
  if (!isNativeAndroid()) {
    // Browser fallback - open in new window
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    const pre = text.replace(/\x1b[^a-zA-Z]*[a-zA-Z]/g, "").replace(/\x1d[^a-zA-Z]*[a-zA-Z]/g, "");
    w.document.open();
    w.document.write(`<!DOCTYPE html><html><head><title>Print</title></head><body><pre style="font-family:monospace;font-size:12px;white-space:pre-wrap">${pre}</pre><script>window.onload=()=>window.print();</script></body></html>`);
    w.document.close();
    return;
  }
  if (!settings) throw new Error("Printer not configured. Go to Admin > Printer.");
  await sendToDefaultPrinter(settings, text);
}

/* ─── Public API ─── */

export async function printAdvanceReceipt(order: AdvanceOrder) {
  const settings = await db.settings.get("app");
  if (!settings) throw new Error("Settings not loaded");
  const text = buildAdvanceEscPos(order, settings);
  await sendToPrinter(text);
}

export async function printAdvanceKot(order: AdvanceOrder) {
  const settings = await db.settings.get("app");
  if (!settings) throw new Error("Settings not loaded");
  const text = buildAdvanceKot(order, settings);
  await sendToPrinter(text);
}

export async function printBookingReceipt(order: BookingOrder) {
  const settings = await db.settings.get("app");
  if (!settings) throw new Error("Settings not loaded");
  const text = buildBookingEscPos(order, settings);
  await sendToPrinter(text);
}

/* ─── Booking KOT ─── */

export function buildBookingKot(order: BookingOrder, settings: Settings): string {
  const WIDTH = settings.paperSize === "80" ? 48 : 32;
  const hr = "-".repeat(WIDTH);
  const money = (n: number) => formatIntMoney(n);
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";
  const lr = (l = "", r = "") => { const sp = WIDTH - l.length - r.length; return l + " ".repeat(Math.max(1, sp)) + r; };

  const now = new Date();
  const timeStr = fmtTime12(now.toTimeString().slice(0, 5));

  const out: string[] = ["\x1b@\x1b3\x18" + CENTER_ON];
  out.push("KITCHEN ORDER");
  out.push(hr);
  out.push(`${order.label === "Appointment" ? "Apt" : "Bkg"} #: ${order.receiptNo}`);
  if (order.cashier) out.push(`By: ${order.cashier}`);
  if (order.customerName) out.push(`Customer: ${order.customerName}`);
  out.push(timeStr);
  out.push(LEFT_ON);
  out.push(hr);
  out.push(lr("Item:", order.bookableItemName));
  out.push(lr("Price:", money(order.price)));
  if (order.discountAmount > 0) out.push(lr("Discount:", money(order.discountAmount)));
  if ((order.taxAmount ?? 0) > 0) out.push(lr(`${getTaxLabel(settings)}:`, money(order.taxAmount!)));
  out.push(lr("Total:", money(order.total)));
  out.push(lr("Advance:", money(order.advancePayment)));
  out.push(lr("Remaining:", money(order.remainingPayment)));
  out.push(hr);
  out.push("");
  out.push("");
  out.push("");
  out.push("\x1dV\x41\x03");
  return out.join("\n");
}

export async function printBookingKot(order: BookingOrder) {
  const settings = await db.settings.get("app");
  if (!settings) throw new Error("Settings not loaded");
  const text = buildBookingKot(order, settings);
  await sendToPrinter(text);
}

/* ─── PDF Builders for Share ─── */

export async function buildAdvanceReceiptPdf(order: AdvanceOrder, settings: Settings | null): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: [144, 420] });
  const left = 6;
  const width = 132;
  let y = 14;
  const lineH = 10;
  const money = (n: number) => formatIntMoney(n);

  const line = (text: string, bold = false, size = 7) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(text.slice(0, 40), left, y);
    y += lineH;
  };
  const rightLine = (l: string, r: string, bold = false) => {
    doc.setFontSize(7);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(l, left, y);
    doc.text(r, left + width, y, { align: "right" });
    y += lineH;
  };
  const hr = () => { doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(left, y - 3, left + width, y - 3); };

  line(settings?.restaurantName || "SANGI POS", true, 9);
  line("ADVANCE ORDER", true, 8);
  line(`Receipt #${order.receiptNo}`, false, 7);
  line(`Date: ${fmtDateTime(order.createdAt)}`);
  if (order.cashier) line(`Cashier: ${order.cashier}`);
  if (order.customerName) line(`Customer: ${order.customerName}`);
  if (order.customerPhone) line(`Phone: ${order.customerPhone}`);
  if (order.deliveryDate) line(`Delivery: ${fmtDate(order.deliveryDate)}${order.deliveryTime ? " " + fmtTime12(order.deliveryTime) : ""}`);
  y += 2; hr(); y += 2;

  for (const l of order.lines) {
    if (l.qty && l.unitPrice) {
      line(l.name);
      rightLine(`  ${l.qty} ${l.unit || "pcs"} x ${money(l.unitPrice)}`, money(l.subtotal));
    } else {
      rightLine(l.name, l.subtotal ? money(l.subtotal) : "");
    }
  }

  y += 2; hr(); y += 2;
  rightLine("Subtotal", money(order.subtotal));
  if (order.discountAmount > 0) rightLine("Discount", money(order.discountAmount));
  if ((order.taxAmount ?? 0) > 0) rightLine(getTaxLabel(settings), money(order.taxAmount!));
  rightLine("Total", money(order.total), true);
  rightLine("Advance", money(order.advancePayment));
  rightLine("Remaining", money(order.remainingPayment), true);

  if (settings && shouldPrintTaxQr(settings)) {
    y = await addTaxQrToPdf({
      doc, settings, receiptNo: order.receiptNo,
      taxAmount: order.taxAmount ?? 0, total: order.total, createdAt: order.createdAt,
      x: left + (width - 50) / 2, y, size: 50,
    });
  }

  return doc;
}

export async function buildBookingReceiptPdf(order: BookingOrder, settings: Settings | null): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: [144, 340] });
  const left = 6;
  const width = 132;
  let y = 14;
  const lineH = 10;
  const money = (n: number) => formatIntMoney(n);

  const line = (text: string, bold = false, size = 7) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(text.slice(0, 40), left, y);
    y += lineH;
  };
  const rightLine = (l: string, r: string, bold = false) => {
    doc.setFontSize(7);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(l, left, y);
    doc.text(r, left + width, y, { align: "right" });
    y += lineH;
  };
  const hr = () => { doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(left, y - 3, left + width, y - 3); };

  line(settings?.restaurantName || "SANGI POS", true, 9);
  line(order.label === "Appointment" ? "APPOINTMENT" : "BOOKING", true, 8);
  line(`Receipt #${order.receiptNo}`, false, 7);
  line(`Item: ${order.bookableItemName}`);
  line(`Date: ${fmtDate(order.date)}`);
  line(`Time: ${order.startTime} → ${order.endTime} (${order.durationHours}h)`);
  if (order.cashier) line(`Cashier: ${order.cashier}`);
  if (order.customerName) line(`Customer: ${order.customerName}`);
  if (order.customerPhone) line(`Phone: ${order.customerPhone}`);
  y += 2; hr(); y += 2;

  rightLine("Price", money(order.price));
  if (order.discountAmount > 0) rightLine("Discount", money(order.discountAmount));
  if ((order.taxAmount ?? 0) > 0) rightLine(getTaxLabel(settings), money(order.taxAmount!));
  rightLine("Total", money(order.total), true);
  rightLine("Advance", money(order.advancePayment));
  rightLine("Remaining", money(order.remainingPayment), true);

  if (settings && shouldPrintTaxQr(settings)) {
    y = await addTaxQrToPdf({
      doc, settings, receiptNo: order.receiptNo,
      taxAmount: order.taxAmount ?? 0, total: order.total, createdAt: order.createdAt,
      x: left + (width - 50) / 2, y, size: 50,
    });
  }

  return doc;
}
