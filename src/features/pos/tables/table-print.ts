import type { Settings } from "@/db/schema";
import { btConnect, btSend, isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { usbSend } from "@/features/pos/usb-printer";
import { db } from "@/db/appDb";
import { fmtDateTime, fmtTime12 } from "@/features/pos/format";
import { getSyncConfig } from "@/features/sync/sync-utils";
import { sendPrintJob } from "@/features/sync/sync-client";
import { isDuplicatePrint } from "@/features/pos/print-dedup";
import { sendToSectionPrinter } from "@/features/pos/printer-routing";

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

  // Native Android - check if Sub should route to Main
  const syncConfig = getSyncConfig();
  const dbSettings = settings || await db.settings.get("app");
  const viaMain = syncConfig.role === "sub" && dbSettings?.subPrinterMode === "main";

  if (!settings && !viaMain) {
    throw new Error("Settings not loaded. Please configure printer in Printer settings.");
  }

  const escPos = buildKotEscPos(tableNumber, waiterName, items);

  // Dedup: prevent duplicate prints from rapid taps or retries
  if (isDuplicatePrint(escPos)) return;

  if (viaMain) {
    // Send to Main's printer
    let b64 = "";
    for (let i = 0; i < escPos.length; i++) {
      b64 += String.fromCharCode(escPos.charCodeAt(i) & 0xff);
    }
    const encoded = btoa(b64);
    const { getLicense } = await import("@/features/licensing/licensing-db");
    const lic = await getLicense();
    const res = await sendPrintJob(encoded, "usb", lic.deviceId, "tables");
    if (!res.success) throw new Error(res.error || "Failed to send KOT to Main device");
    return;
  }

  // Use section-based printer routing for tables
  try {
    await sendToSectionPrinter(settings!, "tables", escPos);
  } catch (printErr: any) {
    console.error("Table KOT print error:", printErr);
    throw new Error(printErr?.message || "Table KOT printing failed. Check printer connection.");
  }
}

function buildKotHtml(tableNumber: string, waiterName: string, items: KotItem[]): string {
  const now = fmtDateTime(Date.now());
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

function buildKotEscPos(tableNumber: string, waiterName: string, items: KotItem[]): string {
  const width = 32; // 58mm thermal printer
  const hr = "-".repeat(width);
  const now = new Date();
  const timeStr = fmtTime12(now.toTimeString().slice(0, 5));

  const center = (s: string) => {
    const pad = Math.max(0, Math.floor((width - s.length) / 2));
    return " ".repeat(pad) + s;
  };

  const out: string[] = [];
  
  // Initialize printer
  out.push("\x1b@");         // init
  out.push("\x1b3\x18");     // tight line spacing
  
  // Header - centered
  out.push(center("KITCHEN ORDER"));
  out.push(hr);
  out.push(center(`Table: ${tableNumber}`));
  out.push(center(`Waiter: ${waiterName}`));
  out.push(center(timeStr));
  out.push(hr);

  // Items - name and quantity only
  for (const item of items) {
    const line = `${item.name}`.padEnd(width - 4) + `x${item.qty}`;
    out.push(line.slice(0, width));
  }

  out.push(hr);
  out.push("");
  out.push("");
  out.push("");
  out.push("\x1dV\x41\x03"); // partial cut

  return out.join("\n");
}
