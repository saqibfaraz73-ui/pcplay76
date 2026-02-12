import type { Settings } from "@/db/schema";
import { btConnect, btSend, isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { usbSend } from "@/features/pos/usb-printer";
import { db } from "@/db/appDb";

type KotItem = {
  name: string;
  qty: number;
};

/**
 * Print Kitchen Order Ticket for table service.
 * Only prints item names and quantities - no prices, no branding.
 */
export async function printTableKot(args: {
  tableNumber: string;
  waiterName: string;
  items: KotItem[];
  settings: Settings | null;
}) {
  const { tableNumber, waiterName, items, settings } = args;
  
  if (!isNativeAndroid()) {
    // Browser fallback - simple print dialog
    const html = buildKotHtml(tableNumber, waiterName, items);
    const w = window.open("", "_blank", "noopener,noreferrer,width=400,height=600");
    if (!w) return;
    w.document.open();
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>KOT - Table ${tableNumber}</title>
  <style>
    body { font-family: monospace; font-size: 14px; padding: 20px; }
    h1 { font-size: 18px; text-align: center; margin-bottom: 10px; }
    .info { text-align: center; margin-bottom: 15px; }
    .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; }
    .item { display: flex; justify-content: space-between; margin: 5px 0; }
    @media print { body { margin: 0; padding: 10px; } }
  </style>
</head>
<body>
  ${html}
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    w.document.close();
    return;
  }

  // Native Android - Bluetooth thermal printing
  if (!settings) {
    throw new Error("Settings not loaded. Please configure printer in Admin > Printer.");
  }
  const conn = settings.printerConnection ?? "none";
  if (conn !== "bluetooth" && conn !== "usb") {
    throw new Error("Printer not configured. Go to Admin > Printer and set Connection to Bluetooth or USB.");
  }

  const escPos = buildKotEscPos(tableNumber, waiterName, items, settings);

  if (conn === "usb") {
    await usbSend(escPos);
    return;
  }

  // Bluetooth
  if (!settings.printerAddress) {
    throw new Error("No printer selected. Go to Admin > Printer, refresh paired devices, and select your printer.");
  }
  await btConnect(settings.printerAddress);
  await btSend(escPos);
}

function buildKotHtml(tableNumber: string, waiterName: string, items: KotItem[]): string {
  const now = new Date().toLocaleString();
  const itemsHtml = items
    .map((item) => `<div class="item"><span>${item.name}</span><span>x${item.qty}</span></div>`)
    .join("");

  return `
    <h1>KITCHEN ORDER</h1>
    <div class="info">
      <div>Table: ${tableNumber}</div>
      <div>Waiter: ${waiterName}</div>
      <div>${now}</div>
    </div>
    <div class="items">
      ${itemsHtml}
    </div>
  `;
}

function getFeedLinesForKot(settings: Settings | null, contentLines: number): number {
  const lineHeightInch = 0.125;
  const sizeMap: Record<string, number> = {
    "1x1": 1, "2x1": 1, "3x1": 1,
    "2x2": 2, "2x3": 3, "2x4": 4, "2x5": 5,
  };
  const targetHeight = sizeMap[settings?.receiptSize ?? "2x3"] ?? 3;
  const contentHeight = contentLines * lineHeightInch;
  const remainingInches = Math.max(0, targetHeight - contentHeight);
  const feedLines = Math.floor(remainingInches / lineHeightInch);
  return Math.max(3, feedLines);
}

function buildKotEscPos(tableNumber: string, waiterName: string, items: KotItem[], settings: Settings | null): string {
  const width = 32; // 58mm thermal printer
  const hr = "-".repeat(width);
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const center = (s: string) => {
    const pad = Math.max(0, Math.floor((width - s.length) / 2));
    return " ".repeat(pad) + s;
  };

  const out: string[] = [];
  
  out.push("\x1b@");
  out.push("\x1b3\x18");
  
  out.push(center("KITCHEN ORDER"));
  out.push(hr);
  out.push(center(`Table: ${tableNumber}`));
  out.push(center(`Waiter: ${waiterName}`));
  out.push(center(timeStr));
  out.push(hr);

  for (const item of items) {
    const line = item.name.slice(0, 16).padEnd(width - 4) + `x${item.qty}`;
    out.push(line.slice(0, width));
  }

  out.push(hr);

  const contentLines = 6 + items.length + 1;
  const feedCount = getFeedLinesForKot(settings, contentLines);
  out.push("\n".repeat(feedCount));
  out.push("\x1dV\x41\x03");

  return out.join("\n");
}
