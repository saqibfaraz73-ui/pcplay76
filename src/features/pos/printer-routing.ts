/**
 * Printer routing helper — resolves which physical printer (BT, USB, or Network)
 * to use for a given section. Supports both legacy (sales/tables) and
 * custom category-based printer sections.
 * Also handles dedicated label printer routing (ZPL/TSPL/ESC-POS).
 */
import type { Settings } from "@/db/schema";
import { btConnect, btSend } from "@/features/pos/bluetooth-printer";
import { usbSend } from "@/features/pos/usb-printer";
import { netConnect, netSend } from "@/features/pos/network-printer";

export type PrintSection = string; // any section name (legacy: "sales" | "tables", custom: "A", "B", etc.)

type PrinterType = "bluetooth" | "usb" | "network" | "none";

/**
 * Get the printer type assigned to a section.
 */
export function getPrinterForSection(settings: Settings, section: PrintSection): PrinterType {
  if (settings.sectionPrinterMap && settings.sectionPrinterMap[section]) {
    return settings.sectionPrinterMap[section];
  }
  return settings.defaultPrinterType ?? "none";
}

export function getDefaultPrinterType(settings: Settings): PrinterType {
  return settings.defaultPrinterType ?? "none";
}

export function getKotPrinterType(settings: Settings): PrinterType {
  return settings.kotPrinterType && settings.kotPrinterType !== "none"
    ? settings.kotPrinterType
    : getDefaultPrinterType(settings);
}

export function getSalesPrinterType(settings: Settings): PrinterType {
  return settings.salesDashboardPrinterType && settings.salesDashboardPrinterType !== "none"
    ? settings.salesDashboardPrinterType
    : getDefaultPrinterType(settings);
}

// ─── Internal: send to the right physical printer ──────

async function sendViaPrinterType(settings: Settings, printerType: PrinterType, data: string): Promise<void> {
  if (printerType === "network") {
    const ip = settings.networkPrinterIp ?? "";
    const port = settings.networkPrinterPort ?? 9100;
    if (!ip) throw new Error("Network printer IP not configured. Go to Printer Settings and set up a Network/WiFi printer.");
    await netConnect(ip, port);
    await netSend(data);
    return;
  }
  if (printerType === "usb") {
    const device = getUsbDevice(settings);
    if (!device) throw new Error("USB printer not configured.");
    await usbSend(data);
    return;
  }
  if (printerType === "bluetooth") {
    const address = getBtAddress(settings);
    if (!address) throw new Error("Bluetooth printer not configured.");
    await btConnect(address);
    await btSend(data);
    return;
  }
  throw new Error("No printer configured.");
}

export async function sendToKotPrinter(settings: Settings, escPos: string): Promise<void> {
  const printerType = getKotPrinterType(settings);
  if (printerType === "none") {
    throw new Error("No KOT printer configured. Go to Printer Settings and set a KOT Printer or Default Printer.");
  }
  await sendViaPrinterType(settings, printerType, escPos);
}

export async function sendToSalesPrinter(settings: Settings, escPos: string): Promise<void> {
  const printerType = getSalesPrinterType(settings);
  if (printerType === "none") {
    throw new Error("No Sales printer configured. Go to Printer Settings and set a Sales Printer or Default Printer.");
  }
  await sendViaPrinterType(settings, printerType, escPos);
}

export async function sendToDefaultPrinter(settings: Settings, escPos: string): Promise<void> {
  const printerType = getDefaultPrinterType(settings);
  if (printerType === "none") {
    throw new Error("No default printer configured. Go to Printer Settings and set a Default Printer.");
  }
  await sendViaPrinterType(settings, printerType, escPos);
}

export function getBtAddress(settings: Settings): string {
  return settings.btPrinterAddress ?? settings.printerAddress ?? "";
}

export function getUsbDevice(settings: Settings): string {
  return settings.usbDeviceName ?? settings.printerAddress ?? "";
}

export async function sendToSectionPrinter(settings: Settings, section: PrintSection, escPos: string): Promise<void> {
  const printerType = getPrinterForSection(settings, section);
  if (printerType === "none") {
    throw new Error(
      `No printer assigned for section "${section}". Go to Printer Settings → Printer Assignment to configure.`
    );
  }
  await sendViaPrinterType(settings, printerType, escPos);
}

// ─── Dedicated Label Printer ───────────────────────────

export async function sendToLabelPrinter(settings: Settings, data: string): Promise<void> {
  const printerType = settings.labelPrinterType ?? "none";
  if (printerType === "none") {
    return sendToDefaultPrinter(settings, data);
  }
  if (printerType === "network") {
    const ip = settings.networkPrinterIp ?? "";
    const port = settings.networkPrinterPort ?? 9100;
    if (!ip) throw new Error("Network printer IP not configured for label printer.");
    await netConnect(ip, port);
    await netSend(data);
    return;
  }
  if (printerType === "usb") {
    const device = settings.labelUsbDevice ?? "";
    if (!device) throw new Error("Label printer USB device not configured.");
    await usbSend(data);
    return;
  }
  // Bluetooth
  const address = settings.labelBtAddress ?? "";
  if (!address) throw new Error("Label printer Bluetooth not configured.");
  await btConnect(address);
  await btSend(data);
}

export function getLabelPrinterLanguage(settings: Settings): "zpl" | "tspl" | "escpos" {
  return settings.labelPrinterLanguage ?? "escpos";
}
