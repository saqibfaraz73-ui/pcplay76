import type { Order, Settings } from "@/db/schema";
import { formatIntMoney, fmtDateTime, fmtTime12 } from "@/features/pos/format";
import { btConnect, btSend, isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { usbSend } from "@/features/pos/usb-printer";
import { generateLogoEscPos } from "@/features/pos/escpos-image";
import { db } from "@/db/appDb";
import { format } from "date-fns";
import { getSyncConfig } from "@/features/sync/sync-utils";
import { sendPrintJob } from "@/features/sync/sync-client";
import { isDuplicatePrint } from "@/features/pos/print-dedup";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

// Calculate how many feed lines to add based on receipt size to fill the paper
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

/* ---------- Classic ESC/POS receipt (for Print button) ---------- */

async function buildEscPosReceipt(
  order: Order,
  settings: Settings,
  opts?: {
    creditCustomerName?: string;
    deliveryPersonName?: string;
    deliveryCustomerName?: string;
  }
): Promise<string> {
  const width = settings.paperSize === "80" ? 48 : 32;
  const hr = "-".repeat(width);

  const line = (s = "") => s.slice(0, width).padEnd(width, " ");
  const money = (n: number) => formatIntMoney(n);

  const title = settings.restaurantName || "SANGI POS";
  const when = fmtDateTime(order.createdAt);
  let payLabel = order.paymentMethod.toUpperCase();
  if (order.paymentMethod === "credit" && opts?.creditCustomerName) {
    payLabel = `CREDIT: ${opts.creditCustomerName}`;
  } else if (order.paymentMethod === "delivery" && opts?.deliveryPersonName) {
    payLabel = `DELIVERY: ${opts.deliveryPersonName}`;
  }

  let logoCommands = "";
  if (settings.showLogo && settings.receiptLogoPath) {
    try {
      logoCommands = await generateLogoEscPos(settings.receiptLogoPath, settings.paperSize);
    } catch (e) {
      console.warn("Could not load logo for printing:", e);
    }
  }

  const deliveryLines: string[] = [];
  if (order.paymentMethod === "delivery") {
    if (opts?.deliveryCustomerName || order.deliveryCustomerName) {
      deliveryLines.push(line(`Customer: ${opts?.deliveryCustomerName || order.deliveryCustomerName}`));
    }
    if (order.deliveryCustomerAddress) {
      deliveryLines.push(line(`Address: ${order.deliveryCustomerAddress}`));
    }
    if (order.deliveryCustomerPhone) {
      deliveryLines.push(line(`Phone: ${order.deliveryCustomerPhone}`));
    }
  }

  const headerLines = [
    line(title),
    settings.showAddress && settings.address ? line(settings.address) : null,
    settings.showPhone && settings.phone ? line(settings.phone) : null,
    line(`Receipt: ${order.receiptNo}`),
    line(`Date: ${when}`),
    line(`Cashier: ${order.cashier}`),
    line(`Payment: ${payLabel}`),
    ...deliveryLines,
  ].filter(Boolean) as string[];

  const itemLines = order.lines.flatMap((l) => {
    const left = `${l.name}`;
    const right = `${l.qty} x ${money(l.unitPrice)}`;
    const lines = [line(left), line(right.padStart(width))];
    if (settings.showExpiryOnReceipt && l.expiryDate) {
      const expStr = format(new Date(l.expiryDate), "dd/MM/yy");
      lines.push(line(`  Exp: ${expStr}`));
    }
    return lines;
  });

  const totals = [
    hr,
    line(`Subtotal`.padEnd(width - money(order.subtotal).length) + money(order.subtotal)),
    line(`Discount`.padEnd(width - money(order.discountTotal).length) + money(order.discountTotal)),
    ...(order.taxAmount > 0
      ? [line((settings.taxLabel || "Tax").padEnd(width - money(order.taxAmount).length) + money(order.taxAmount))]
      : []),
    ...(order.serviceChargeAmount > 0
      ? [line((settings.serviceChargeLabel || "Service").padEnd(width - money(order.serviceChargeAmount).length) + money(order.serviceChargeAmount))]
      : []),
    line(`Total`.padEnd(width - money(order.total).length) + money(order.total)),
    hr,
    line("Thank you!"),
  ];

  const totalContentLines = headerLines.length + 1 + itemLines.length + totals.length + (logoCommands ? 4 : 0);
  const feedCount = getFeedLinesForSize(settings, totalContentLines);

  return [
    "\x1b@",
    logoCommands,
    headerLines.join("\n"),
    hr,
    itemLines.join("\n"),
    totals.join("\n"),
    "\n".repeat(feedCount),
    "\x1dV\x41\x03",
  ].join("\n");
}

/* ---------- Centered KOT receipt (for KOT button) ---------- */

async function buildKotReceipt(order: Order, settings: Settings): Promise<string> {
  const WIDTH = 32;
  const hr = "-".repeat(WIDTH);
  const money = (n: number) => formatIntMoney(n);

  const center = (s = "") => {
    const trimmed = s.slice(0, WIDTH);
    const pad = Math.max(0, Math.floor((WIDTH - trimmed.length) / 2));
    return " ".repeat(pad) + trimmed;
  };
  const lr = (l = "", r = "") => {
    const sp = WIDTH - l.length - r.length;
    return l + " ".repeat(Math.max(1, sp)) + r;
  };

  const now = new Date();
  const timeStr = fmtTime12(now.toTimeString().slice(0, 5));

  const out: string[] = [];

  out.push("\x1b@");       // init
  out.push("\x1b3\x18");   // tight line spacing

  out.push(center("KITCHEN ORDER"));
  out.push(hr);
  out.push(center(`Bill #: ${order.receiptNo}`));
  out.push(center(`Cashier: ${order.cashier}`));
  out.push(center(`Payment: ${order.paymentMethod.toUpperCase()}`));
  out.push(center(timeStr));
  out.push(hr);

  // Items with qty and price
  out.push("Item".padEnd(16) + "Qty".padStart(5) + "Total".padStart(11));
  out.push(hr);
  for (const item of order.lines) {
    out.push(
      item.name.slice(0, 16).padEnd(16) +
      String(item.qty).padStart(5) +
      money(item.subtotal).padStart(11)
    );
  }

  out.push(hr);
  out.push(lr("Subtotal:", money(order.subtotal)));
  if (order.discountTotal > 0) out.push(lr("Discount:", money(order.discountTotal)));
  out.push(lr("Grand Total:", money(order.total)));
  out.push(hr);
  out.push("");
  out.push("");
  out.push("");
  out.push("\x1dV\x41\x03"); // partial cut

  return out.join("\n");
}

/* ---------- settings ---------- */

async function getSettingsSafe(): Promise<Settings | null> {
  try {
    const settings = await db.settings.get("app");
    return settings ?? null;
  } catch (error) {
    console.error("getSettingsSafe error:", error);
    return null;
  }
}

/* ---------- Check if Sub should route print to Main ---------- */

async function shouldPrintViaMain(): Promise<boolean> {
  try {
    const syncConfig = getSyncConfig();
    if (syncConfig.role !== "sub") return false;
    const settings = await db.settings.get("app");
    return settings?.subPrinterMode === "main";
  } catch {
    return false;
  }
}

async function sendPrintToMain(text: string): Promise<void> {
  // Dedup: prevent duplicate prints when Main is slow or connection drops
  if (isDuplicatePrint(text)) return;

  // Base64-encode the ESC/POS raw text for transport
  let b64 = "";
  for (let i = 0; i < text.length; i++) {
    b64 += String.fromCharCode(text.charCodeAt(i) & 0xff);
  }
  const encoded = btoa(b64);

  // Determine Main's printer type from sync - we send as "usb" by default,
  // Main will use whatever printer it has configured
  const { getLicense } = await import("@/features/licensing/licensing-db");
  const lic = await getLicense();
  const res = await sendPrintJob(encoded, "usb", lic.deviceId);
  if (!res.success) {
    throw new Error(res.error || "Failed to send print job to Main device");
  }
}

/* ---------- Print (classic format) ---------- */

export async function printReceiptFromOrder(
  order: Order,
  opts?: { creditCustomerName?: string; deliveryPersonName?: string; deliveryCustomerName?: string }
) {
  let settings: Settings | null = null;

  try {
    settings = await getSettingsSafe();
  } catch (error) {
    console.error("Failed to get settings:", error);
    throw new Error("Could not load settings. Please try again.");
  }

  if (isNativeAndroid()) {
    // Check if Sub device should send to Main's printer
    const viaMain = await shouldPrintViaMain();

    if (!settings) {
      if (viaMain) {
        // Build receipt with defaults and send to Main
        const defaultSettings: Settings = {
          id: "app", restaurantName: "SANGI POS", paperSize: "58",
          showAddress: false, showPhone: false, showLogo: false, updatedAt: 0,
        };
        const text = await buildEscPosReceipt(order, defaultSettings, opts);
        await sendPrintToMain(text);
        return;
      }
      throw new Error("Settings not loaded. Please configure printer in Admin > Printer.");
    }

    const text = await buildEscPosReceipt(order, settings, opts);

    // Dedup: prevent duplicate local prints from rapid taps
    if (isDuplicatePrint(text)) return;

    if (viaMain) {
      await sendPrintToMain(text);
      return;
    }

    const conn = settings.printerConnection ?? "none";
    if (conn !== "bluetooth" && conn !== "usb") {
      throw new Error("Printer not configured. Go to Printer settings and set Connection to Bluetooth or USB, or enable 'Use Main Device Printer'.");
    }

    if (conn === "usb") {
      try {
        await usbSend(text);
      } catch (usbErr: any) {
        console.error("USB print error:", usbErr);
        throw new Error(usbErr?.message || "USB printing failed. Check printer connection.");
      }
      return;
    }

    // Bluetooth
    if (!settings.printerAddress) {
      throw new Error("No printer selected. Go to Printer, refresh paired devices, and select your printer.");
    }
    try {
      await btConnect(settings.printerAddress);
      await btSend(text);
    } catch (btError: any) {
      console.error("Bluetooth print error:", btError);
      throw new Error(btError?.message || "Bluetooth printing failed. Check printer connection.");
    }
    return;
  }

  // Fallback: browser print
  const when = fmtDateTime(order.createdAt);
  const paymentLabel =
    order.paymentMethod === "credit" && opts?.creditCustomerName
      ? `CREDIT • ${opts.creditCustomerName}`
      : order.paymentMethod.toUpperCase();

  const linesHtml = order.lines
    .map((l) => {
      const expiryHtml = settings?.showExpiryOnReceipt && l.expiryDate
        ? `<div style="font-size:11px;color:#888">Exp: ${format(new Date(l.expiryDate), "dd/MM/yyyy")}</div>`
        : "";
      return `
        <tr>
          <td>${escapeHtml(l.name)}${expiryHtml}</td>
          <td>${l.qty}</td>
          <td>${escapeHtml(formatIntMoney(l.unitPrice))}</td>
          <td>${escapeHtml(formatIntMoney(l.subtotal))}</td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:monospace;max-width:320px;margin:auto;padding:16px">
      <div style="display:flex;justify-content:space-between">
        <div><div style="font-weight:bold">Receipt</div><div>${escapeHtml(String(order.receiptNo))}</div></div>
        <div><div style="font-weight:bold">Date</div><div>${escapeHtml(when)}</div></div>
      </div>
      <div style="margin-top:8px">
        <div><div style="font-weight:bold">Cashier</div><div>${escapeHtml(order.cashier)}</div></div>
        <div><div style="font-weight:bold">Payment</div><div>${escapeHtml(paymentLabel)}</div></div>
      </div>
      <table style="width:100%;margin-top:12px;border-collapse:collapse">
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
        <tbody>${linesHtml}</tbody>
      </table>
      <div style="margin-top:12px">
        <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${escapeHtml(formatIntMoney(order.subtotal))}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Discount</span><span>${escapeHtml(formatIntMoney(order.discountTotal))}</span></div>
        ${order.taxAmount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Tax</span><span>${escapeHtml(formatIntMoney(order.taxAmount))}</span></div>` : ''}
        ${order.serviceChargeAmount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Service</span><span>${escapeHtml(formatIntMoney(order.serviceChargeAmount))}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:bold"><span>Total</span><span>${escapeHtml(formatIntMoney(order.total))}</span></div>
      </div>
    </div>`;

  const w = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
  if (!w) return;

  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
    <style>@media print { body { margin: 0; } }</style></head>
    <body>${html}<script>window.onload = () => { window.print(); };</script></body></html>`);
  w.document.close();
}

/* ---------- KOT (centered format) ---------- */

export async function printKotFromOrder(order: Order) {
  const settings = await getSettingsSafe();

  if (!isNativeAndroid()) {
    // Browser fallback - simple print dialog
    const now = new Date();
    const timeStr = fmtTime12(now.toTimeString().slice(0, 5));
    const itemsHtml = order.lines
      .map((l) => `<div class="item"><span>${escapeHtml(l.name)}</span><span>x${l.qty}</span><span>${escapeHtml(formatIntMoney(l.subtotal))}</span></div>`)
      .join("");
    const html = `
      <h1>KITCHEN ORDER</h1>
      <div class="info">
        <div>Bill #: ${escapeHtml(String(order.receiptNo))}</div>
        <div>Cashier: ${escapeHtml(order.cashier)}</div>
        <div>Payment: ${escapeHtml(order.paymentMethod.toUpperCase())}</div>
        <div>${escapeHtml(timeStr)}</div>
      </div>
      <div class="items">${itemsHtml}</div>
      <div class="totals">
        <div class="item"><span>Subtotal</span><span></span><span>${escapeHtml(formatIntMoney(order.subtotal))}</span></div>
        ${order.discountTotal > 0 ? `<div class="item"><span>Discount</span><span></span><span>${escapeHtml(formatIntMoney(order.discountTotal))}</span></div>` : ""}
        <div class="item" style="font-weight:bold"><span>Grand Total</span><span></span><span>${escapeHtml(formatIntMoney(order.total))}</span></div>
      </div>`;
    const w = window.open("", "_blank", "noopener,noreferrer,width=400,height=600");
    if (!w) return;
    w.document.open();
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>KOT</title>
<style>
  body { font-family: monospace; font-size: 14px; padding: 20px; }
  h1 { font-size: 18px; text-align: center; margin-bottom: 10px; }
  .info { text-align: center; margin-bottom: 15px; }
  .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; }
  .item { display: flex; justify-content: space-between; margin: 5px 0; }
  @media print { body { margin: 0; padding: 10px; } }
</style></head>
<body>${html}<script>window.onload = () => { window.print(); };</script></body></html>`);
    w.document.close();
    return;
  }

  if (!settings) {
    // If using Main's printer, build with defaults
    const viaMain = await shouldPrintViaMain();
    if (viaMain) {
      const defaultSettings: Settings = {
        id: "app", restaurantName: "SANGI POS", paperSize: "58",
        showAddress: false, showPhone: false, showLogo: false, updatedAt: 0,
      };
      const text = await buildKotReceipt(order, defaultSettings);
      await sendPrintToMain(text);
      return;
    }
    throw new Error("Printer not configured");
  }

  const text = await buildKotReceipt(order, settings);

  // Check if Sub should send to Main's printer
  const viaMain = await shouldPrintViaMain();
  if (viaMain) {
    await sendPrintToMain(text);
    return;
  }

  const conn = settings.printerConnection ?? "none";
  if (conn === "usb") {
    await usbSend(text);
    return;
  }

  if (!settings.printerAddress) {
    throw new Error("Printer not configured");
  }
  await btConnect(settings.printerAddress);
  await btSend(text);
}
