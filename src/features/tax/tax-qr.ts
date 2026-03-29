/**
 * Shared tax QR code utilities for ESC/POS thermal printing and PDF receipts.
 * Supports both generic format and FBR-compliant QR codes.
 *
 * QR module sizes (ESC/POS):
 *   - FBR (API or Excel): 3 (was 4) — compact for long URLs
 *   - Generic tax: 4 (was 5)
 *   - Default buildEscPosQr: 4 (was 6)
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
  const isApi = s.taxApiEnabled && s.taxApiMode === "fbr";

  if (isFbr) {
    const posId = s.taxApiPosId || s.fbrPosId || "";
    const ntn = s.taxApiBusinessNtn || s.fbrNtn || "";
    const curr = s.currencySymbol || "Rs";
    const usin = `${posId}-${String(receiptNo).padStart(6, "0")}`;
    const verifyUrl = `https://tp.fbr.gov.pk/VerifyInvoice?USIN=${usin}&NTN=${ntn}&POSID=${posId}&DateTime=${encodeURIComponent(dateStr)}&TotalSaleValue=${total}&TotalTaxCharged=${taxAmount}`;

    // Show "FBR Verified Invoice" only if API mode OR user explicitly enabled the label for Excel mode
    const showVerifiedLabel = isApi || !!s.fbrVerifiedLabel;

    const lines: string[] = [];
    if (showVerifiedLabel) lines.push(`FBR Verified Invoice`);
    lines.push(
      `Receipt#: ${receiptNo}`,
      `NTN: ${ntn}`,
      `POS ID: ${posId}`,
      `USIN: ${usin}`,
      `Date: ${dateStr}`,
      `Total: ${curr} ${total}`,
      `Tax: ${curr} ${taxAmount}`,
      ``,
      `Verify: ${verifyUrl}`,
    );
    return lines.join("\n");
  }

  // Generic format
  const ntn = s.taxApiBusinessNtn || s.fbrNtn || "";
  const posId = s.taxApiPosId || s.fbrPosId || "";
  return [
    `Receipt#: ${receiptNo}`,
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
  // Via Tax API (must be explicitly enabled with NTN)
  if (settings.taxEnabled && settings.taxApiEnabled && settings.taxApiBusinessNtn) return true;
  // Via FBR Excel details (must have fbrQrOnReceipt explicitly enabled + NTN)
  if (settings.taxEnabled && settings.fbrQrOnReceipt && settings.fbrNtn) return true;
  // Custom tax without FBR/API → NO QR
  return false;
}

/**
 * Build ESC/POS native QR code commands.
 * moduleSize was 6, now default 4 for thermal printer readability.
 */
export function buildEscPosQr(data: string, moduleSize = 4): string {
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
  // FBR QR uses module size 3 (was 4), generic uses 4 (was 5)
  const isFbr = args.settings.taxApiMode === "fbr" || (!args.settings.taxApiEnabled && args.settings.fbrQrOnReceipt);
  const moduleSize = isFbr ? 3 : 4;
  return "\n" + buildEscPosQr(payload, moduleSize);
}

/**
 * Add tax QR code image to a jsPDF document.
 * Returns the new Y position after the QR code.
 * PDF QR size reduced from 20mm to 16mm.
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
  const { doc, settings, x, y, size = 16 } = args;
  if (!shouldPrintTaxQr(settings)) return y;

  const payload = buildTaxQrPayload(args);
  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      width: 160,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    doc.addImage(dataUrl, "PNG", x, y, size, size);

    // "FBR Verified" label only for API mode, or if user enabled it for Excel mode
    const isApi = settings.taxApiEnabled && settings.taxApiMode === "fbr";
    if (isApi || settings.fbrVerifiedLabel) {
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
