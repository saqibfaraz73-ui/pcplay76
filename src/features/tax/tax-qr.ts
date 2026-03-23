/**
 * Shared tax QR code utilities for ESC/POS thermal printing and PDF receipts.
 * Used across all modules that print receipts with tax information.
 */
import type { Settings } from "@/db/schema";
import QRCode from "qrcode";

/** Build the tax QR data payload (JSON string) */
export function buildTaxQrPayload(args: {
  settings: Settings;
  receiptNo: number | string;
  taxAmount: number;
  total: number;
  createdAt: number;
}): string {
  const { settings: s, receiptNo, taxAmount, total, createdAt } = args;
  const dt = new Date(createdAt);
  const dateStr = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  return [
    `NTN: ${s.taxApiBusinessNtn ?? ""}`,
    `POS: ${s.taxApiPosId ?? ""}`,
    `Invoice: ${receiptNo}`,
    `Date: ${dateStr}`,
    `Tax (${s.taxValue ?? 0}%): ${taxAmount}`,
    `Total: ${total}`,
  ].join("\n");
}

/** Check if tax QR should be printed */
export function shouldPrintTaxQr(settings: Settings | null): boolean {
  if (!settings) return false;
  return !!(
    settings.taxEnabled &&
    settings.taxApiEnabled &&
    !settings.taxQrDisabled &&
    settings.taxApiBusinessNtn
  );
}

/**
 * Build ESC/POS native QR code commands.
 * Uses GS ( k function for QR code generation on compatible printers.
 */
export function buildEscPosQr(data: string, moduleSize = 6): string {
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";

  let cmd = CENTER_ON;

  // GS ( k — QR Code: Select model (Model 2)
  cmd += "\x1d\x28\x6b\x04\x00\x31\x41\x32\x00";

  // GS ( k — QR Code: Set module size
  cmd += "\x1d\x28\x6b\x03\x00\x31\x43" + String.fromCharCode(moduleSize);

  // GS ( k — QR Code: Set error correction level (M)
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

/** Build ESC/POS tax QR commands if tax QR is enabled */
export function buildTaxQrEscPos(args: {
  settings: Settings;
  receiptNo: number | string;
  taxAmount: number;
  total: number;
  createdAt: number;
}): string {
  if (!shouldPrintTaxQr(args.settings)) return "";
  const payload = buildTaxQrPayload(args);
  return "\n" + buildEscPosQr(payload, 5);
}

/**
 * Add tax QR code image to a jsPDF document.
 * Returns the new Y position after the QR code.
 */
export async function addTaxQrToPdf(args: {
  doc: import("jspdf").jsPDF;
  settings: Settings;
  receiptNo: number | string;
  taxAmount: number;
  total: number;
  createdAt: number;
  x: number;
  y: number;
  size?: number; // QR size in doc units (default 20)
}): Promise<number> {
  const { doc, settings, x, y, size = 20 } = args;
  if (!shouldPrintTaxQr(settings)) return y;

  const payload = buildTaxQrPayload(args);
  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    doc.addImage(dataUrl, "PNG", x, y, size, size);
    return y + size + 2;
  } catch (e) {
    console.warn("Failed to generate tax QR for PDF:", e);
    return y;
  }
}
