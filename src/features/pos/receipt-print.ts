import type { Order, Settings } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { btConnect, btSend, isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { usbSend } from "@/features/pos/usb-printer";
import { generateLogoEscPos } from "@/features/pos/escpos-image";
import { db } from "@/db/appDb";
import { format } from "date-fns";

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
    "1x1": 1,
    "2x1": 1,
    "3x1": 1,
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
    centered?: boolean;
  }
): Promise<string> {
  const width = settings.paperSize === "80" ? 48 : 32;
  const hr = "-".repeat(width);

  const centered = opts?.centered ?? false;
  const line = (s = "") => {
    const trimmed = s.slice(0, width);
    if (centered) {
      const pad = Math.max(0, Math.floor((width - trimmed.length) / 2));
      return " ".repeat(pad) + trimmed;
    }
    return trimmed.padEnd(width, " ");
  };
  const money = (n: number) => formatIntMoney(n);

  const title = settings.restaurantName || "SANGI POS";
  const when = new Date(order.createdAt).toLocaleString([], { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
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

async function buildKotReceipt(order: Order, settings: Settings, opts?: { centered?: boolean }): Promise<string> {
  const WIDTH = 32;
  const hr = "-".repeat(WIDTH);
  const money = (n: number) => formatIntMoney(n);
  const centered = opts?.centered ?? false;

  const align = (s = "") => {
    const trimmed = s.slice(0, WIDTH);
    if (centered) {
      const pad = Math.floor((WIDTH - trimmed.length) / 2);
      return " ".repeat(pad) + trimmed;
    }
    return trimmed;
  };

  const lr = (l = "", r = "") => {
    const sp = WIDTH - l.length - r.length;
    return l + " ".repeat(Math.max(1, sp)) + r;
  };

  const out: string[] = [];

  out.push("\x1b@");       // init
  out.push("\x1b3\x18");   // tight line spacing

  // KOT never shows logo, address, or phone
  out.push(align(settings.restaurantName || "SANGI POS"));

  out.push(hr);
  out.push(align(`Bill #: ${order.receiptNo}`));
  out.push(align(`Date: ${format(new Date(order.createdAt), "dd/MM/yyyy h:mm a")}`));
  out.push(align(`Prepared By: ${order.cashier}`));
  out.push(align(`Payment: ${order.paymentMethod.toUpperCase()}`));
  out.push(hr);

  out.push(
    "Item".padEnd(16) +
    "Qty".padStart(5) +
    "Total".padStart(11)
  );
  out.push(hr);

  order.lines.forEach((i) => {
    out.push(
      i.name.slice(0, 16).padEnd(16) +
      String(i.qty).padStart(5) +
      money(i.subtotal).padStart(11)
    );
  });

  out.push(hr);
  out.push(lr("Subtotal:", money(order.subtotal)));
  out.push(lr("Grand Total:", money(order.total)));
  out.push(hr);
  out.push(align("Thank you, come again!"));

  const contentLines = 8 + order.lines.length + 5;
  const feedCount = getFeedLinesForSize(settings, contentLines);
  out.push("\n".repeat(feedCount));
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
    if (!settings) {
      throw new Error("Settings not loaded. Please configure printer in Admin > Printer.");
    }
    const conn = settings.printerConnection ?? "none";
    if (conn !== "bluetooth" && conn !== "usb") {
      throw new Error("Printer not configured. Go to Admin > Printer and set Connection to Bluetooth or USB.");
    }

    const text = await buildEscPosReceipt(order, settings, {
      ...opts,
      centered: conn === "usb",
    });

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
      throw new Error("No printer selected. Go to Admin > Printer, refresh paired devices, and select your printer.");
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
  const when = new Date(order.createdAt).toLocaleString([], { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
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
  if (!isNativeAndroid()) return;

  const settings = await getSettingsSafe();
  if (!settings) throw new Error("Printer not configured");
  
  const conn = settings.printerConnection ?? "none";
  const text = await buildKotReceipt(order, settings, { centered: true });

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
