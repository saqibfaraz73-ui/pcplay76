/**
 * Fallback SKU recovery: match text chunks from an app-generated PDF
 * against locally stored menu items to recover their SKU values.
 */
import { db } from "@/db/appDb";

/**
 * Given an array of text strings extracted from a PDF (e.g. item names),
 * find matching menu items in the local DB and return their SKU values.
 */
export async function findSkusFromAppLabelPdfTextChunks(textChunks: string[]): Promise<string[]> {
  if (!textChunks.length) return [];

  try {
    const items = await db.items.toArray();
    if (!items.length) return [];

    const skus: string[] = [];
    const seen = new Set<string>();

    // Normalize text chunks for matching
    const normalizedChunks = textChunks.map((t) => t.trim().toLowerCase()).filter(Boolean);

    for (const item of items) {
      if (!item.sku || !item.sku.trim()) continue;
      const sku = item.sku.trim();
      if (seen.has(sku)) continue;

      const nameNorm = item.name.trim().toLowerCase();
      // Truncated name (matches label-pdf.ts which truncates to 22 chars)
      const nameTrunc = nameNorm.length > 22 ? nameNorm.slice(0, 22) : nameNorm;

      for (const chunk of normalizedChunks) {
        if (
          chunk === nameNorm ||
          chunk === nameTrunc ||
          chunk.startsWith(nameTrunc) ||
          // Also match the SKU text itself printed below the barcode
          chunk === sku.toLowerCase()
        ) {
          skus.push(sku);
          seen.add(sku);
          break;
        }
      }
    }

    return skus;
  } catch {
    return [];
  }
}
