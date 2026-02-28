/**
 * Printer routing helper — resolves which physical printer (BT or USB)
 * to use for a given section. Supports both legacy (sales/tables) and
 * custom category-based printer sections.
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
