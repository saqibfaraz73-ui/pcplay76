import jsPDF from "jspdf";
import { db } from "@/db/appDb";
import type { Category, MenuItem, Settings } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { resolveStockImage } from "@/features/pos/stock-images";
import { getItemImageSrc } from "@/features/admin/products/item-images";
import { writePdfFile, shareFile } from "@/features/files/sangi-folders";
import { Capacitor } from "@capacitor/core";

/**
 * Load an image URL as a base64 data URL for embedding in jsPDF.
 * Returns null if the image can't be loaded.
 */
async function loadImageAsDataUrl(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function resolveImageSrc(imagePath?: string): Promise<string | null> {
  if (!imagePath) return null;
  if (imagePath.startsWith("stock://")) {
    return resolveStockImage(imagePath);
  }
  try {
    return await getItemImageSrc(imagePath);
  } catch {
    return null;
  }
}

export async function generateMenuPdf() {
  const [categories, items, settings] = await Promise.all([
    db.categories.orderBy("createdAt").toArray(),
    db.items.orderBy("createdAt").toArray(),
    db.settings.get("app"),
  ]);

  const catMap = new Map<string, Category>();
  for (const c of categories) catMap.set(c.id, c);

  // Group items by category
  const grouped = new Map<string, MenuItem[]>();
  for (const item of items) {
    const list = grouped.get(item.categoryId) ?? [];
    list.push(item);
    grouped.set(item.categoryId, list);
  }

  // Pre-load all item images
  const imageCache = new Map<string, string | null>();
  const imagePromises: Promise<void>[] = [];
  for (const item of items) {
    if (item.imagePath) {
      imagePromises.push(
        (async () => {
          const src = await resolveImageSrc(item.imagePath);
          if (src) {
            const dataUrl = await loadImageAsDataUrl(src);
            imageCache.set(item.id, dataUrl);
          }
        })()
      );
    }
  }
  await Promise.all(imagePromises);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const usableW = pageW - marginX * 2;

  const cols = 6;
  const colGap = 3;
  const cellW = (usableW - colGap * (cols - 1)) / cols;
  const imgH = cellW * 0.75; // 4:3 aspect
  const cellH = imgH + 14; // image + name + price lines

  let y = 10;

  // Title
  const restaurantName = settings?.restaurantName ?? "Menu";
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(restaurantName, pageW / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Complete Menu", pageW / 2, y, { align: "center" });
  y += 8;

  for (const cat of categories) {
    const catItems = grouped.get(cat.id);
    if (!catItems || catItems.length === 0) continue;

    // Check if category header fits
    if (y + 10 > pageH - 10) {
      doc.addPage();
      y = 10;
    }

    // Category header
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setDrawColor(80, 80, 80);
    doc.text(cat.name, marginX, y + 5);
    y += 3;
    doc.setLineWidth(0.3);
    doc.line(marginX, y + 3, pageW - marginX, y + 3);
    y += 7;

    // Render items in rows of 5
    for (let i = 0; i < catItems.length; i += cols) {
      // Check if row fits on current page
      if (y + cellH > pageH - 10) {
        doc.addPage();
        y = 10;
      }

      const rowItems = catItems.slice(i, i + cols);
      for (let j = 0; j < rowItems.length; j++) {
        const item = rowItems[j];
        const x = marginX + j * (cellW + colGap);

        // Draw image placeholder / actual image
        const dataUrl = imageCache.get(item.id);
        if (dataUrl) {
          try {
            doc.addImage(dataUrl, "JPEG", x, y, cellW, imgH);
          } catch {
            // Draw placeholder
            doc.setFillColor(240, 240, 240);
            doc.rect(x, y, cellW, imgH, "F");
          }
        } else {
          doc.setFillColor(240, 240, 240);
          doc.rect(x, y, cellW, imgH, "F");
        }

        // Border around image
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.rect(x, y, cellW, imgH, "S");

        // Item name (truncate if too long)
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        let name = item.name;
        // Truncate name to fit cell width
        while (doc.getTextWidth(name) > cellW - 1 && name.length > 3) {
          name = name.slice(0, -1);
        }
        if (name !== item.name) name += "…";
        doc.text(name, x + cellW / 2, y + imgH + 4, { align: "center" });

        // Price
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        const priceText = item.variations && item.variations.length > 0
          ? item.variations.map(v => `${v.name}: ${formatIntMoney(v.price)}`).join(" | ")
          : formatIntMoney(item.price);
        
        // Truncate price text too if needed
        let pText = priceText;
        while (doc.getTextWidth(pText) > cellW - 1 && pText.length > 3) {
          pText = pText.slice(0, -1);
        }
        if (pText !== priceText) pText += "…";
        doc.text(pText, x + cellW / 2, y + imgH + 8, { align: "center" });
      }

      y += cellH + 3;
    }

    y += 2; // gap between categories
  }

  // Save and share
  if (Capacitor.isNativePlatform()) {
    const pdfBytes = doc.output("arraybuffer");
    const result = await writePdfFile({
      folder: "Sales Report",
      fileName: `Menu_${Date.now()}.pdf`,
      pdfBytes: new Uint8Array(pdfBytes),
    });
    await shareFile({ title: "Menu", uri: result.uri });
  } else {
    // Web fallback: download
    doc.save("Menu.pdf");
  }
}
