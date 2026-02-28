/**
 * ESC/POS label printing — generates barcode commands for thermal printers.
 * Uses GS k (Code128) for barcode + ESC/POS text for product name/price.
 */
import type { Settings } from "@/db/schema";
import { sendToDefaultPrinter } from "@/features/pos/printer-routing";
import { isNativeAndroid } from "@/features/pos/bluetooth-printer";

interface LabelData {
  name: string;
  sku: string;
  price?: string;
}

function buildLabelEscPos(label: LabelData, paperSize: "58" | "80"): string {
  const WIDTH = paperSize === "80" ? 48 : 32;
  const CENTER_ON = "\x1ba\x01";
  const LEFT_ON = "\x1ba\x00";

  let out = "\x1b@"; // init
  out += "\x1b3\x14"; // line spacing
  out += CENTER_ON;

  // Product name (bold)
  out += "\x1b\x45\x01"; // bold on
  out += label.name.slice(0, WIDTH) + "\n";
  out += "\x1b\x45\x00"; // bold off

  // Price if provided
  if (label.price) {
    out += label.price + "\n";
  }

  // Barcode: GS w (width), GS h (height), GS H (HRI position), GS k (print)
  out += "\x1dw\x02";    // barcode width: 2
  out += "\x1dh\x50";    // barcode height: 80 dots
  out += "\x1dH\x02";    // HRI below barcode
  out += "\x1df\x00";    // HRI font A

  // GS k m n d1...dk — Code128 (m=73)
  const skuBytes = label.sku;
  // Code128B: prefix with {B
  const data = "{B" + skuBytes;
  out += "\x1dk\x49" + String.fromCharCode(data.length) + data;

  out += "\n\n";
  out += LEFT_ON;
  out += "\x1dV\x41\x03"; // partial cut

  return out;
}

/** Print multiple labels via ESC/POS thermal printer */
export async function printLabelsEscPos(
  labels: LabelData[],
  settings: Settings
): Promise<void> {
  if (!isNativeAndroid()) {
    throw new Error("Thermal label printing requires the Android app.");
  }

  const allEscPos = labels.map((l) => buildLabelEscPos(l, settings.paperSize)).join("");

  await sendToDefaultPrinter(settings, allEscPos);
}
