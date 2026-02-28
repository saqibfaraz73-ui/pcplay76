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
import { sendToSectionPrinter, getPrinterForSection, type PrintSection } from "@/features/pos/printer-routing";

/**
 * Build ESC/POS native QR code commands.
 * Uses GS ( k function for QR code generation on compatible printers.
 */
function buildEscPosQr(data: string, moduleSize = 6): string {
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";
  
  let cmd = CENTER_ON;
  
  // GS ( k — QR Code: Select model (Model 2)
  cmd += "\x1d\x28\x6b\x04\x00\x31\x41\x32\x00";
  
  // GS ( k — QR Code: Set module size (bigger = easier to scan)
  cmd += "\x1d\x28\x6b\x03\x00\x31\x43" + String.fromCharCode(moduleSize);
  
  // GS ( k — QR Code: Set error correction level (M = 49, better scan reliability)
  cmd += "\x1d\x28\x6b\x03\x00\x31\x45\x31";
  
  // GS ( k — QR Code: Store data
  const storeLen = data.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  cmd += "\x1d\x28\x6b" + String.fromCharCode(pL, pH) + "\x31\x50\x30" + data;
  
  // GS ( k — QR Code: Print
  cmd += "\x1d\x28\x6b\x03\x00\x31\x51\x30";
  
  cmd += LEFT_ON;
  return cmd;
}

/**
 * Build ESC/POS Code128 barcode commands for receipt number.
 * Prints a scannable barcode containing "RCV-{receiptNo}".
 */
function buildEscPosBarcode(receiptNo: number, paperSize: string): string {
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";
  const barcodeContent = `RCV-${receiptNo}`;
  // Prefix with {B to select Code128 Code-Set B (alphanumeric)
  const data = "{B" + barcodeContent;

  let cmd = CENTER_ON;

  // GS h — Set barcode height (50 dots)
  cmd += "\x1d\x68\x32";
  // GS w — Set barcode width (2 = medium)
  cmd += "\x1d\x77" + (paperSize === "58" ? "\x02" : "\x02");
  // GS H — Print HRI (human-readable) below barcode
  cmd += "\x1d\x48\x02";
  // GS f — Set HRI font (font A)
  cmd += "\x1d\x66\x00";
  // GS k — Print Code128 barcode (type 73 = Code128)
  cmd += "\x1d\x6b\x49" + String.fromCharCode(data.length) + data;

  cmd += "\n" + LEFT_ON;
  return cmd;
}

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

// Minimal feed before cut — no extra paper waste
function getFeedLinesForSize(_settings: Settings, _contentLines: number): number {
  return 0;
}

/* ---------- Classic ESC/POS receipt (for Print button) ---------- */

async function buildEscPosReceipt(
  order: Order,
  settings: Settings,
  opts?: {
    creditCustomerName?: string;
    deliveryPersonName?: string;
    deliveryCustomerName?: string;
    forUsb?: boolean;
    skipBarcode?: boolean;
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
      logoCommands = await generateLogoEscPos(settings.receiptLogoPath, settings.paperSize, opts?.forUsb);
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

  // Use ESC/POS hardware centering for clean output on all paper sizes
  const CENTER_ON = "\x1ba\x01";  // ESC a 1 = center alignment
  const LEFT_ON = "\x1ba\x00";    // ESC a 0 = left alignment

  const showBizName = settings.showBusinessNameOnReceipt !== false; // default true
  const headerLines = [
    CENTER_ON,
    // When biz name is disabled, logo (printed above) takes its place — no extra blank line
    ...(showBizName ? [title] : []),
    settings.showAddress && settings.address ? settings.address : null,
    settings.showPhone && settings.phone ? settings.phone : null,
    `Bill #: ${order.receiptNo}`,
    `Date: ${when}`,
    `Prepared By: ${order.cashier}`,
    `Payment: ${payLabel}`,
    ...deliveryLines.map(l => l.trim()),
    // For USB: keep center alignment for items too; for BT: switch to left
    ...(opts?.forUsb ? [] : [LEFT_ON]),
  ].filter(Boolean) as string[];

  // Column header: Item / Qty / Total
  const colHeader = "Item".padEnd(width - 14) + "Qty".padStart(5) + "Total".padStart(9);

  const itemLines = order.lines.flatMap((l) => {
    const nameCol = l.name.slice(0, width - 14).padEnd(width - 14);
    const qtyCol = String(l.qty).padStart(5);
    const totalCol = money(l.subtotal).padStart(9);
    const lines = [nameCol + qtyCol + totalCol];
    if (settings.showExpiryOnReceipt && l.expiryDate) {
      const expStr = format(new Date(l.expiryDate), "dd/MM/yy");
      lines.push(line(`  Exp: ${expStr}`));
    }
    return lines;
  });

  const lr = (l: string, r: string) => l.padEnd(width - r.length) + r;

  const totals = [
    hr,
    lr("Subtotal:", money(order.subtotal)),
    ...(order.discountTotal > 0
      ? [lr("Discount:", money(order.discountTotal))]
      : []),
    ...(order.taxAmount > 0
      ? [lr((settings.taxLabel || "Tax") + ":", money(order.taxAmount))]
      : []),
    ...(order.serviceChargeAmount > 0
      ? [lr((settings.serviceChargeLabel || "Service") + ":", money(order.serviceChargeAmount))]
      : []),
    lr("Grand Total:", money(order.total)),
    hr,
    // For USB: already centered; for BT: switch to center for footer
    ...(opts?.forUsb ? [] : [CENTER_ON]),
    "Thank you, come again!",
    ...(opts?.forUsb ? [] : [LEFT_ON]),
  ];

  // QR code with receipt data (optional, uses ESC/POS native QR commands)
  // Skip barcode for table management receipts — only print on sales receipts
  let qrCommands = "";
  if (settings.receiptQrEnabled && !opts?.skipBarcode) {
    // Print a Code128 barcode with receipt number (scannable by any barcode scanner)
    qrCommands = buildEscPosBarcode(order.receiptNo, settings.paperSize);
  }

  const totalContentLines = headerLines.length + 1 + itemLines.length + totals.length + (logoCommands ? 4 : 0);
  const feedCount = getFeedLinesForSize(settings, totalContentLines);

  // Init commands joined without newlines to avoid blank lines at top
  let receipt = "\x1b@";
  if (opts?.forUsb && logoCommands) {
    // For USB: set zero line spacing before logo to eliminate gap above it
    receipt += "\x1b3\x00";
    receipt += logoCommands;
    receipt += "\x1b3\x14"; // restore normal line spacing after logo
  } else {
    receipt += "\x1b3\x14";
    if (logoCommands) receipt += logoCommands;
  }
  receipt += headerLines.join("\n") + "\n";
  receipt += colHeader + "\n";
  receipt += hr + "\n";
  receipt += itemLines.join("\n") + "\n";
  receipt += totals.join("\n");
  if (qrCommands) receipt += "\n" + qrCommands;
  if (feedCount > 0) receipt += "\n".repeat(feedCount);
  receipt += "\n\x1dV\x41\x03";
  return receipt;
}

/* ---------- Centered KOT receipt (for KOT button) ---------- */

async function buildKotReceipt(order: Order, settings: Settings): Promise<string> {
  const WIDTH = settings.paperSize === "80" ? 48 : 32;
  const hr = "-".repeat(WIDTH);
  const money = (n: number) => formatIntMoney(n);
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";

  const lr = (l = "", r = "") => {
    const sp = WIDTH - l.length - r.length;
    return l + " ".repeat(Math.max(1, sp)) + r;
  };

  const now = new Date();
  const timeStr = fmtTime12(now.toTimeString().slice(0, 5));

  const out: string[] = [];

  // Init commands as single entry to avoid blank lines at top
  out.push("\x1b@\x1b3\x14" + CENTER_ON);
  out.push("KITCHEN ORDER");
  out.push(hr);
  out.push(`Bill #: ${order.receiptNo}`);
  out.push(`Cashier: ${order.cashier}`);
  out.push(`Payment: ${order.paymentMethod.toUpperCase()}`);
  out.push(timeStr);
  out.push(LEFT_ON);
  out.push(hr);

  // Items with qty and price
  const nameW = WIDTH - 14;
  out.push("Item".padEnd(nameW) + "Qty".padStart(5) + "Total".padStart(9));
  out.push(hr);
  for (const item of order.lines) {
    out.push(
      item.name.slice(0, nameW).padEnd(nameW) +
      String(item.qty).padStart(5) +
      money(item.subtotal).padStart(9)
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

async function sendPrintToMain(text: string, section: "sales" | "tables" = "sales"): Promise<void> {
  // Dedup: prevent duplicate prints when Main is slow or connection drops
  if (isDuplicatePrint(text)) return;

  // Base64-encode the ESC/POS raw text for transport
  let b64 = "";
  for (let i = 0; i < text.length; i++) {
    b64 += String.fromCharCode(text.charCodeAt(i) & 0xff);
  }
  const encoded = btoa(b64);

  const { getLicense } = await import("@/features/licensing/licensing-db");
  const lic = await getLicense();
  const res = await sendPrintJob(encoded, "usb", lic.deviceId, section);
  if (!res.success) {
    throw new Error(res.error || "Failed to send print job to Main device");
  }
}

/* ---------- Print (classic format) ---------- */

export async function printReceiptFromOrder(
  order: Order,
  opts?: { creditCustomerName?: string; deliveryPersonName?: string; deliveryCustomerName?: string; section?: PrintSection }
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
        await sendPrintToMain(text, opts?.section ?? "sales");
        return;
      }
      throw new Error("Settings not loaded. Please configure printer in Admin > Printer.");
    }

    const section: PrintSection = opts?.section ?? "sales";
    const isUsb = getPrinterForSection(settings, section) === "usb";
    const skipBarcode = section === "tables";
    const text = await buildEscPosReceipt(order, settings, { ...opts, forUsb: isUsb, skipBarcode });

    if (viaMain) {
      await sendPrintToMain(text, opts?.section ?? "sales");
      return;
    }

    if (isDuplicatePrint(text)) return;


    try {
      await sendToSectionPrinter(settings, section, text);
    } catch (printErr: any) {
      console.error("Print error:", printErr);
      // If logo was included and print failed, retry without logo
      if (settings.showLogo && settings.receiptLogoPath) {
        console.warn("Retrying print without logo...");
        const noLogoSettings = { ...settings, showLogo: false };
        const retryText = await buildEscPosReceipt(order, noLogoSettings, { ...opts, forUsb: isUsb });
        try {
          await sendToSectionPrinter(noLogoSettings, section, retryText);
          return;
        } catch (retryErr: any) {
          throw new Error(retryErr?.message || "Printing failed. Check printer connection.");
        }
      }
      throw new Error(printErr?.message || "Printing failed. Check printer connection.");
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
      await sendPrintToMain(text, "sales");
      return;
    }
    throw new Error("Printer not configured");
  }

  const text = await buildKotReceipt(order, settings);

  // Check if Sub should send to Main's printer
  const viaMain = await shouldPrintViaMain();
  if (viaMain) {
    await sendPrintToMain(text, "sales");
    return;
  }

  // Use section-based printer routing (KOT from sales dashboard)
  try {
    await sendToSectionPrinter(settings, "sales", text);
  } catch (printErr: any) {
    console.error("KOT print error:", printErr);
    throw new Error(printErr?.message || "KOT printing failed. Check printer connection.");
  }
}
