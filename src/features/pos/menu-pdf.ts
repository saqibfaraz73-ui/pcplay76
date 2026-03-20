import jsPDF from "jspdf";
import { db } from "@/db/appDb";
import type { Category, MenuItem, Settings } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { resolveStockImage } from "@/features/pos/stock-images";
import { getItemImageSrc } from "@/features/admin/products/item-images";
import { sharePdfBlob } from "@/features/pos/share-utils";

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

  // Use 3 columns instead of 6 for much bigger text
  const cols = 3;
  const colGap = 4;
  const cellW = (usableW - colGap * (cols - 1)) / cols;
  const imgH = cellW * 0.7; // image height

  let y = 10;

  // Title
  const restaurantName = settings?.restaurantName ?? "Menu";
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(restaurantName, pageW / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Complete Menu", pageW / 2, y, { align: "center" });
  y += 10;

  for (const cat of categories) {
    const catItems = grouped.get(cat.id);
    if (!catItems || catItems.length === 0) continue;

    // Check if category header fits
    if (y + 12 > pageH - 10) {
      doc.addPage();
      y = 10;
    }

    // Category header
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setDrawColor(80, 80, 80);
    doc.text(cat.name, marginX, y + 5);
    y += 3;
    doc.setLineWidth(0.3);
    doc.line(marginX, y + 3, pageW - marginX, y + 3);
    y += 8;

    // Render items in rows
    for (let i = 0; i < catItems.length; i += cols) {
      // Estimate cell height for this row
      const rowItems = catItems.slice(i, i + cols);
      
      // Calculate max cell height for this row
      let maxExtraLines = 0;
      for (const item of rowItems) {
        let extra = 0;
        // Variations add lines
        if (item.variations && item.variations.length > 0) {
          extra += item.variations.length;
        }
        // Included items add lines
        if (item.includedItems && item.includedItems.length > 0) {
          extra += item.includedItems.length;
        }
        maxExtraLines = Math.max(maxExtraLines, extra);
      }
      
      const baseCellH = imgH + 18; // image + name + price
      const extraH = maxExtraLines * 4.5;
      const rowH = baseCellH + extraH;

      // Check if row fits on current page
      if (y + rowH > pageH - 10) {
        doc.addPage();
        y = 10;
      }

      for (let j = 0; j < rowItems.length; j++) {
        const item = rowItems[j];
        const x = marginX + j * (cellW + colGap);

        // Draw image placeholder / actual image
        const dataUrl = imageCache.get(item.id);
        if (dataUrl) {
          try {
            doc.addImage(dataUrl, "JPEG", x, y, cellW, imgH);
          } catch {
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

        let textY = y + imgH + 5;

        // Item name - bigger font
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        let name = item.name;
        while (doc.getTextWidth(name) > cellW - 2 && name.length > 3) {
          name = name.slice(0, -1);
        }
        if (name !== item.name) name += "…";
        doc.text(name, x + cellW / 2, textY, { align: "center" });
        textY += 5;

        // Price - bigger font, green
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 128, 0);

        if (item.variations && item.variations.length > 0) {
          // Show each variation on its own line
          for (const v of item.variations) {
            const vText = `${v.name}: ${formatIntMoney(v.price)}`;
            let vt = vText;
            doc.setFontSize(9);
            while (doc.getTextWidth(vt) > cellW - 2 && vt.length > 3) {
              vt = vt.slice(0, -1);
            }
            if (vt !== vText) vt += "…";
            doc.text(vt, x + cellW / 2, textY, { align: "center" });
            textY += 4.5;
          }
        } else {
          const priceText = formatIntMoney(item.price);
          doc.text(priceText, x + cellW / 2, textY, { align: "center" });
          textY += 5;
        }

        // Included items (combo contents)
        if (item.includedItems && item.includedItems.length > 0) {
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          for (const ci of item.includedItems) {
            const ciText = `${ci.qty}x ${ci.name}`;
            doc.text(ciText, x + cellW / 2, textY, { align: "center" });
            textY += 4;
          }
        }

        doc.setTextColor(0, 0, 0); // reset
      }

      y += rowH + 3;
    }

    y += 3; // gap between categories
  }

  // Always open share dialog (no save to device)
  const pdfBlob = doc.output("blob");
  await sharePdfBlob(pdfBlob, `Menu_${Date.now()}`);
}