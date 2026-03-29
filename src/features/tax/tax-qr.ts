/**
 * Shared tax QR code utilities for ESC/POS thermal printing and PDF receipts.
 * Supports both generic format and FBR-compliant QR codes.
 */
import type { Settings } from "@/db/schema";
import QRCode from "qrcode";

/** Build the tax QR data payload — FBR format or generic */
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

  const isFbr = s.taxApiMode === "fbr" || (!s.taxApiEnabled && s.fbrQrOnReceipt);

  if (isFbr) {
    const posId = s.taxApiPosId || s.fbrPosId || "";
    const ntn = s.taxApiBusinessNtn || s.fbrNtn || "";
    const curr = s.currencySymbol || "Rs";
    const usin = `${posId}-${String(receiptNo).padStart(6, "0")}`;
    const verifyUrl = `https://tp.fbr.gov.pk/VerifyInvoice?USIN=${usin}&NTN=${ntn}&POSID=${posId}&DateTime=${encodeURIComponent(dateStr)}&TotalSaleValue=${total}&TotalTaxCharged=${taxAmount}`;
    return [
      `FBR Verified Invoice`,
      `NTN: ${ntn}`,
      `POS ID: ${posId}`,
      `USIN: ${usin}`,
      `Date: ${dateStr}`,
      `Total: ${curr} ${total}`,
      `Tax: ${curr} ${taxAmount}`,
      ``,
      `Verify: ${verifyUrl}`,
    ].join("\n");
  }

  // Generic format
  const ntn = s.taxApiBusinessNtn || s.fbrNtn || "";
  const posId = s.taxApiPosId || s.fbrPosId || "";
  return [
    `NTN: ${ntn}`,
    `POS: ${posId}`,
    `Invoice: ${receiptNo}`,
    `Date: ${dateStr}`,
    `Tax (${s.taxValue ?? 0}%): ${taxAmount}`,
    `Total: ${total}`,
  ].join("\n");
}

/** Check if tax QR should be printed */
export function shouldPrintTaxQr(settings: Settings | null): boolean {
  if (!settings) return false;
  if (settings.taxQrDisabled) return false;
  // Via Tax API
  if (settings.taxEnabled && settings.taxApiEnabled && settings.taxApiBusinessNtn) return true;
  // Via FBR Excel details (no API needed)
  if (settings.taxEnabled && settings.fbrQrOnReceipt && settings.fbrNtn) return true;
  return false;
}

/**
 * Build ESC/POS native QR code commands.
 */
export function buildEscPosQr(data: string, moduleSize = 6): string {
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";

  let cmd = CENTER_ON;
  cmd += "\x1d\x28\x6b\x04\x00\x31\x41\x32\x00";
  cmd += "\x1d\x28\x6b\x03\x00\x31\x43" + String.fromCharCode(moduleSize);
  cmd += "\x1d\x28\x6b\x03\x00\x31\x45\x31";

  const storeLen = data.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  cmd += "\x1d\x28\x6b" + String.fromCharCode(pL, pH) + "\x31\x50\x30" + data;
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
  // FBR QR needs smaller module size since URL is longer
  const moduleSize = args.settings.taxApiMode === "fbr" ? 4 : 5;
  return "\n" + buildEscPosQr(payload, moduleSize);
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
  size?: number;
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

    // For FBR mode, add "FBR Verified" label below QR
    if (settings.taxApiMode === "fbr") {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text("FBR Verified Invoice", x + size / 2, y + size + 4, { align: "center" });
      return y + size + 8;
    }

    return y + size + 2;
  } catch (e) {
    console.warn("Failed to generate tax QR for PDF:", e);
    return y;
  }
}
