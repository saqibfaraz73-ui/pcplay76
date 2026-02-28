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
  // Legacy fallback for "sales" and "tables"
  if (section === "tables") {
    return settings.tablePrinterType ?? settings.printerConnection ?? "none";
  }
  return settings.salesPrinterType ?? settings.printerConnection ?? "none";
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
