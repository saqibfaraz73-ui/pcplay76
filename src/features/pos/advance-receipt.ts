import type { Settings } from "@/db/schema";
import type { AdvanceOrder, BookingOrder } from "@/db/booking-schema";
import { formatIntMoney, fmtDate, fmtDateTime, fmtTime12 } from "@/features/pos/format";
import { btConnect, btSend, isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { usbSend } from "@/features/pos/usb-printer";
import { db } from "@/db/appDb";
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

  const headerLines = [
    line(title),
    settings.showAddress && settings.address ? line(settings.address) : null,
    settings.showPhone && settings.phone ? line(settings.phone) : null,
    line("ADVANCE ORDER"),
    line(`Receipt #: ${order.receiptNo}`),
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

  const footerLines = [
    hr,
    line("Subtotal:".padEnd(width - money(order.subtotal).length) + money(order.subtotal)),
    order.discountAmount > 0 ? line("Discount:".padEnd(width - money(order.discountAmount).length) + money(order.discountAmount)) : null,
    line("Total:".padEnd(width - money(order.total).length) + money(order.total)),
    line("Advance:".padEnd(width - money(order.advancePayment).length) + money(order.advancePayment)),
    line("Remaining:".padEnd(width - money(order.remainingPayment).length) + money(order.remainingPayment)),
    hr,
  ].filter(Boolean) as string[];

  const totalContentLines = headerLines.length + itemLines.length + footerLines.length;
  const feedCount = getFeedLinesForSize(settings, totalContentLines);

  return ["\x1b@", headerLines.join("\n"), itemLines.join("\n"), footerLines.join("\n"), "\n".repeat(feedCount), "\x1dV\x41\x03"].join("\n");
}

/* ─── Advance Order KOT ─── */

function buildAdvanceKot(order: AdvanceOrder, settings: Settings): string {
  const WIDTH = 32;
  const hr = "-".repeat(WIDTH);
  const money = (n: number) => formatIntMoney(n);
  const center = (s = "") => { const pad = Math.max(0, Math.floor((WIDTH - s.length) / 2)); return " ".repeat(pad) + s; };
  const lr = (l = "", r = "") => { const sp = WIDTH - l.length - r.length; return l + " ".repeat(Math.max(1, sp)) + r; };

  const out: string[] = ["\x1b@", "\x1b3\x18"];
  out.push(center(settings.restaurantName || "SANGI POS"));
  out.push(hr);
  out.push(center(`Adv #: ${order.receiptNo}`));
  out.push(center(`Date: ${fmtDateTime(order.createdAt)}`));
  if (order.cashier) out.push(center(`By: ${order.cashier}`));
  if (order.customerName) out.push(center(`Customer: ${order.customerName}`));
  out.push(hr);
  out.push("Item".padEnd(16) + "Qty".padStart(5) + "Total".padStart(11));
  out.push(hr);

  for (const l of order.lines) {
    out.push(l.name.slice(0, 16).padEnd(16) + String(l.qty || "").padStart(5) + money(l.subtotal).padStart(11));
  }

  out.push(hr);
  out.push(lr("Total:", money(order.total)));
  out.push(lr("Advance:", money(order.advancePayment)));
  out.push(lr("Remaining:", money(order.remainingPayment)));
  out.push(hr);
  out.push("\n\n\n");
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

  const headerLines = [
    line(title),
    settings.showAddress && settings.address ? line(settings.address) : null,
    settings.showPhone && settings.phone ? line(settings.phone) : null,
    line("BOOKING"),
    line(`Receipt #: ${order.receiptNo}`),
    hr,
    line(`Item: ${order.bookableItemName}`),
    line(`Date: ${dateStr}`),
    line(`Time: ${order.startTime} - ${order.endTime}`),
    line(`Duration: ${order.durationHours}h`),
    order.cashier ? line(`Cashier: ${order.cashier}`) : null,
    order.customerName ? line(`Customer: ${order.customerName}`) : null,
    order.customerPhone ? line(`Phone: ${order.customerPhone}`) : null,
    hr,
  ].filter(Boolean) as string[];

  const footerLines = [
    line("Price:".padEnd(width - money(order.price).length) + money(order.price)),
    order.discountAmount > 0 ? line("Discount:".padEnd(width - money(order.discountAmount).length) + money(order.discountAmount)) : null,
    line("Total:".padEnd(width - money(order.total).length) + money(order.total)),
    line("Advance:".padEnd(width - money(order.advancePayment).length) + money(order.advancePayment)),
    line("Remaining:".padEnd(width - money(order.remainingPayment).length) + money(order.remainingPayment)),
    hr,
  ].filter(Boolean) as string[];

  const totalContentLines = headerLines.length + footerLines.length;
  const feedCount = getFeedLinesForSize(settings, totalContentLines);

  return ["\x1b@", headerLines.join("\n"), footerLines.join("\n"), "\n".repeat(feedCount), "\x1dV\x41\x03"].join("\n");
}

/* ─── Generic send helper ─── */

async function sendToPrinter(text: string) {
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
  const conn = settings.printerConnection ?? "none";
  if (conn !== "bluetooth" && conn !== "usb") throw new Error("Printer not configured.");
  if (conn === "usb") { await usbSend(text); return; }
  if (!settings.printerAddress) throw new Error("No printer selected.");
  await btConnect(settings.printerAddress);
  await btSend(text);
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
  const WIDTH = 32;
  const hr = "-".repeat(WIDTH);
  const money = (n: number) => formatIntMoney(n);
  const center = (s = "") => { const pad = Math.max(0, Math.floor((WIDTH - s.length) / 2)); return " ".repeat(pad) + s; };
  const lr = (l = "", r = "") => { const sp = WIDTH - l.length - r.length; return l + " ".repeat(Math.max(1, sp)) + r; };

  const out: string[] = ["\x1b@", "\x1b3\x18"];
  out.push(center(settings.restaurantName || "SANGI POS"));
  out.push(hr);
  out.push(center(`Bkg #: ${order.receiptNo}`));
  out.push(center(`Date: ${fmtDate(order.date)}`));
  out.push(center(`Time: ${order.startTime} → ${order.endTime}`));
  out.push(center(`Duration: ${order.durationHours}h`));
  if (order.cashier) out.push(center(`By: ${order.cashier}`));
  if (order.customerName) out.push(center(`Customer: ${order.customerName}`));
  out.push(hr);
  out.push(lr("Item:", order.bookableItemName));
  out.push(lr("Price:", money(order.price)));
  if (order.discountAmount > 0) out.push(lr("Discount:", money(order.discountAmount)));
  out.push(lr("Total:", money(order.total)));
  out.push(lr("Advance:", money(order.advancePayment)));
  out.push(lr("Remaining:", money(order.remainingPayment)));
  out.push(hr);
  out.push("\n\n\n");
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

export function buildAdvanceReceiptPdf(order: AdvanceOrder, settings: Settings | null): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: [144, 360] });
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
  rightLine("Total", money(order.total), true);
  rightLine("Advance", money(order.advancePayment));
  rightLine("Remaining", money(order.remainingPayment), true);

  return doc;
}

export function buildBookingReceiptPdf(order: BookingOrder, settings: Settings | null): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: [144, 288] });
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
  line("BOOKING", true, 8);
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
  rightLine("Total", money(order.total), true);
  rightLine("Advance", money(order.advancePayment));
  rightLine("Remaining", money(order.remainingPayment), true);

  return doc;
}
