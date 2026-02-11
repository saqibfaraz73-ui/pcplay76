import { db } from "@/db/appDb";
import type { Category, MenuItem } from "@/db/schema";
import { makeId } from "@/features/admin/id";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { ensureSangiFolders, folderPath } from "@/features/files/sangi-folders";

// Excel export format columns
const EXCEL_HEADERS = [
  "Category",
  "Item Name",
  "Selling Price",
  "Buying Price",
  "Track Inventory",
  "Stock Unit",
  "Current Stock",
  "Expiry Date",
];

export async function exportMenuItemsToExcel(): Promise<Blob> {
  const [categories, items, inventory] = await Promise.all([
    db.categories.toArray(),
    db.items.toArray(),
    db.inventory.toArray(),
  ]);

  const catById = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const invById = Object.fromEntries(inventory.map((i) => [i.itemId, i.quantity]));

  const rows: (string | number)[][] = [EXCEL_HEADERS];

  for (const item of items) {
    const row = [
      catById[item.categoryId] ?? "",
      item.name,
      item.price,
      item.buyingPrice ?? "",
      item.trackInventory ? "Yes" : "No",
      item.stockUnit ?? "pcs",
      item.trackInventory ? (invById[item.id] ?? 0) : "",
      item.expiryDate ? format(new Date(item.expiryDate), "yyyy-MM-dd") : "",
    ];
    rows.push(row);
  }

  // Create workbook and worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Menu Items");

  // Generate Excel file as blob
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

export type ImportResult = {
  success: boolean;
  categoriesCreated: number;
  itemsCreated: number;
  itemsUpdated: number;
  errors: string[];
};

export async function importMenuItemsFromCSV(csvContent: string): Promise<ImportResult> {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  const result: ImportResult = {
    success: false,
    categoriesCreated: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    errors: [],
  };

  if (lines.length < 2) {
    result.errors.push("CSV file is empty or has no data rows.");
    return result;
  }

  // Skip header row
  const dataLines = lines.slice(1);

  // Get existing categories and items
  const existingCategories = await db.categories.toArray();
  const existingItems = await db.items.toArray();
  const catByName = Object.fromEntries(existingCategories.map((c) => [c.name.toLowerCase(), c]));
  const itemByName = Object.fromEntries(existingItems.map((i) => [i.name.toLowerCase(), i]));

  const now = Date.now();

  for (let i = 0; i < dataLines.length; i++) {
    const lineNum = i + 2; // 1-indexed, skip header
    const cells = parseCSVLine(dataLines[i]);

    if (cells.length < 2) {
      result.errors.push(`Line ${lineNum}: Not enough columns.`);
      continue;
    }

    const [
      categoryName,
      itemName,
      sellingPriceStr,
      buyingPriceStr,
      trackInventoryStr,
      stockUnitStr,
      currentStockStr,
      expiryDateStr,
      imagePath,
    ] = cells;

    if (!categoryName?.trim() || !itemName?.trim()) {
      result.errors.push(`Line ${lineNum}: Category and Item Name are required.`);
      continue;
    }

    // Get or create category
    let category = catByName[categoryName.toLowerCase()];
    if (!category) {
      category = {
        id: makeId("cat"),
        name: categoryName.trim(),
        createdAt: now,
      };
      await db.categories.put(category);
      catByName[categoryName.toLowerCase()] = category;
      result.categoriesCreated++;
    }

    // Parse values
    const sellingPrice = parseInt(sellingPriceStr || "0", 10) || 0;
    const buyingPrice = parseInt(buyingPriceStr || "0", 10) || 0;
    const trackInventory = (trackInventoryStr || "").toLowerCase() === "yes";
    const stockUnit = stockUnitStr && ["pcs", "kg", "ltr", "ft", "m"].includes(stockUnitStr) ? stockUnitStr as any : "pcs";
    const currentStock = parseInt(currentStockStr || "0", 10) || 0;
    let expiryDate: number | undefined;
    if (expiryDateStr) {
      const parsed = Date.parse(expiryDateStr);
      if (!isNaN(parsed)) expiryDate = parsed;
    }

    // Check if item exists
    const existingItem = itemByName[itemName.toLowerCase()];
    if (existingItem) {
      // Update existing item
      const updated: MenuItem = {
        ...existingItem,
        categoryId: category.id,
        price: sellingPrice,
        buyingPrice: buyingPrice > 0 ? buyingPrice : undefined,
        trackInventory,
        stockUnit: stockUnit !== "pcs" ? stockUnit : undefined,
        expiryDate,
        imagePath: imagePath?.trim() || existingItem.imagePath,
      };
      await db.items.put(updated);
      if (trackInventory) {
        await db.inventory.put({ itemId: updated.id, quantity: currentStock, updatedAt: now });
      }
      result.itemsUpdated++;
    } else {
      // Create new item
      const newItem: MenuItem = {
        id: makeId("item"),
        categoryId: category.id,
        name: itemName.trim(),
        price: sellingPrice,
        buyingPrice: buyingPrice > 0 ? buyingPrice : undefined,
        trackInventory,
        stockUnit: stockUnit !== "pcs" ? stockUnit : undefined,
        expiryDate,
        imagePath: imagePath?.trim() || undefined,
        createdAt: now,
      };
      await db.items.put(newItem);
      itemByName[itemName.toLowerCase()] = newItem;
      if (trackInventory) {
        await db.inventory.put({ itemId: newItem.id, quantity: currentStock, updatedAt: now });
      }
      result.itemsCreated++;
    }
  }

  result.success = result.errors.length === 0 || result.itemsCreated > 0 || result.itemsUpdated > 0;
  return result;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

/** Save and share Excel file on native, or download on web */
export async function downloadExcel(blob: Blob, filename: string) {
  if (Capacitor.isNativePlatform()) {
    await ensureSangiFolders();
    const buffer = await blob.arrayBuffer();
    const base64 = uint8ToBase64(new Uint8Array(buffer));
    const path = `${folderPath("Sales Report")}/${filename}`;
    await Filesystem.writeFile({
      directory: Directory.Documents,
      path,
      data: base64,
      recursive: true,
    });
    const uri = await Filesystem.getUri({ directory: Directory.Documents, path });
    await Share.share({ title: filename, url: uri.uri, dialogTitle: filename });
  } else {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
