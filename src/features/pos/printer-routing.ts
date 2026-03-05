/**
 * Printer routing helper — resolves which physical printer (BT or USB)
 * to use for a given section. Supports both legacy (sales/tables) and
 * custom category-based printer sections.
 * Also handles dedicated label printer routing (ZPL/TSPL/ESC-POS).
 */
import type { Settings } from "@/db/schema";
import { btConnect, btSend } from "@/features/pos/bluetooth-printer";
import { usbSend } from "@/features/pos/usb-printer";

export type PrintSection = string; // any section name (legacy: "sales" | "tables", custom: "A", "B", etc.)

/**
 * Get the printer type assigned to a section.
 * Checks sectionPrinterMap first, then falls back to legacy fields.
 */
export function getPrinterForSection(
  settings: Settings,
  section: PrintSection
): "bluetooth" | "usb" | "none" {
  // Check custom section map first
  if (settings.sectionPrinterMap && settings.sectionPrinterMap[section]) {
    return settings.sectionPrinterMap[section];
  }
  // Fall back to default printer
  return settings.defaultPrinterType ?? "none";
}

/**
 * Get the default printer type (universal fallback).
 */
export function getDefaultPrinterType(settings: Settings): "bluetooth" | "usb" | "none" {
  return settings.defaultPrinterType ?? "none";
}

/**
 * Get the KOT (Kitchen Order Ticket) printer type.
 * Falls back to default printer if not specifically configured.
 */
export function getKotPrinterType(settings: Settings): "bluetooth" | "usb" | "none" {
  return settings.kotPrinterType && settings.kotPrinterType !== "none"
    ? settings.kotPrinterType
    : getDefaultPrinterType(settings);
}

/**
 * Get the Sales Dashboard printer type.
 * Falls back to default printer if not specifically configured.
 */
export function getSalesPrinterType(settings: Settings): "bluetooth" | "usb" | "none" {
  return settings.salesDashboardPrinterType && settings.salesDashboardPrinterType !== "none"
    ? settings.salesDashboardPrinterType
    : getDefaultPrinterType(settings);
}

/**
 * Send ESC/POS data to the KOT printer.
 */
export async function sendToKotPrinter(
  settings: Settings,
  escPos: string
): Promise<void> {
  const printerType = getKotPrinterType(settings);

  if (printerType === "none") {
    throw new Error(
      "No KOT printer configured. Go to Printer Settings and set a KOT Printer or Default Printer."
    );
  }

  if (printerType === "usb") {
    const device = getUsbDevice(settings);
    if (!device) throw new Error("USB printer not configured.");
    await usbSend(escPos);
    return;
  }

  const address = getBtAddress(settings);
  if (!address) throw new Error("Bluetooth printer not configured.");
  await btConnect(address);
  await btSend(escPos);
}

/**
 * Send ESC/POS data to the Sales Dashboard printer.
 */
export async function sendToSalesPrinter(
  settings: Settings,
  escPos: string
): Promise<void> {
  const printerType = getSalesPrinterType(settings);

  if (printerType === "none") {
    throw new Error(
      "No Sales printer configured. Go to Printer Settings and set a Sales Printer or Default Printer."
    );
  }

  if (printerType === "usb") {
    const device = getUsbDevice(settings);
    if (!device) throw new Error("USB printer not configured.");
    await usbSend(escPos);
    return;
  }

  const address = getBtAddress(settings);
  if (!address) throw new Error("Bluetooth printer not configured.");
  await btConnect(address);
  await btSend(escPos);
}

/**
 * Send ESC/POS data to the default printer.
 * Used for features that don't have section-based routing (advance, booking, recovery, labels, custom print, etc.)
 */
export async function sendToDefaultPrinter(
  settings: Settings,
  escPos: string
): Promise<void> {
  const printerType = getDefaultPrinterType(settings);

  if (printerType === "none") {
    throw new Error(
      "No default printer configured. Go to Printer Settings and set a Default Printer."
    );
  }

  if (printerType === "usb") {
    const device = getUsbDevice(settings);
    if (!device) {
      throw new Error("USB printer not configured. Go to Printer Settings and set up a USB printer.");
    }
    await usbSend(escPos);
    return;
  }

  // Bluetooth
  const address = getBtAddress(settings);
  if (!address) {
    throw new Error("Bluetooth printer not configured. Go to Printer Settings and select a Bluetooth printer.");
  }
  await btConnect(address);
  await btSend(escPos);
}

/**
 * Get the Bluetooth address for the section's printer.
 */
export function getBtAddress(settings: Settings): string {
  return settings.btPrinterAddress ?? settings.printerAddress ?? "";
}

/**
 * Get the USB device name for the section's printer.
 */
export function getUsbDevice(settings: Settings): string {
  return settings.usbDeviceName ?? settings.printerAddress ?? "";
}

/**
 * Send ESC/POS data to the correct local printer for the given section.
 */
export async function sendToSectionPrinter(
  settings: Settings,
  section: PrintSection,
  escPos: string
): Promise<void> {
  const printerType = getPrinterForSection(settings, section);

  if (printerType === "none") {
    throw new Error(
      `No printer assigned for section "${section}". ` +
      "Go to Printer Settings → Printer Assignment to configure."
    );
  }

  if (printerType === "usb") {
    const device = getUsbDevice(settings);
    if (!device) {
      throw new Error("USB printer not configured. Go to Printer Settings and set up a USB printer.");
    }
    await usbSend(escPos);
    return;
  }

  // Bluetooth
  const address = getBtAddress(settings);
  if (!address) {
    throw new Error("Bluetooth printer not configured. Go to Printer Settings and select a Bluetooth printer.");
  }
  await btConnect(address);
  await btSend(escPos);
}

// ─── Dedicated Label Printer ───────────────────────────

/**
 * Send raw data (ZPL, TSPL, or ESC/POS) to the dedicated label printer.
 * Uses separate label printer connection settings (labelBtAddress / labelUsbDevice).
 * Falls back to the default receipt printer if no label printer is configured.
 */
export async function sendToLabelPrinter(
  settings: Settings,
  data: string
): Promise<void> {
  const printerType = settings.labelPrinterType ?? "none";

  if (printerType === "none") {
    // Fallback: try default receipt printer (ESC/POS only)
    return sendToDefaultPrinter(settings, data);
  }

  if (printerType === "usb") {
    const device = settings.labelUsbDevice ?? "";
    if (!device) {
      throw new Error("Label printer USB device not configured. Go to Printer Settings → Label Printer.");
    }
    await usbSend(data);
    return;
  }

  // Bluetooth
  const address = settings.labelBtAddress ?? "";
  if (!address) {
    throw new Error("Label printer Bluetooth not configured. Go to Printer Settings → Label Printer.");
  }
  await btConnect(address);
  await btSend(data);
}

/**
 * Get the label printer language setting.
 */
export function getLabelPrinterLanguage(settings: Settings): "zpl" | "tspl" | "escpos" {
  return settings.labelPrinterLanguage ?? "escpos";
}
