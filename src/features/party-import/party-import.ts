import * as XLSX from "xlsx";
import { db } from "@/db/appDb";
import type { Supplier, SupplierArrival, ExportCustomer, ExportSale } from "@/db/schema";
import { makeId } from "@/features/admin/id";

/**
 * Excel columns for arrival/sale import:
 * Party Name | Item Name | Quantity | Unit | Unit Price | Total | Note
 *
 * - "Party Name" matches supplier/buyer by name (case-insensitive).
 * - If "Total" is empty, it is calculated as Quantity × Unit Price.
 */

const EXPECTED_HEADERS = [
  "Party Name",
  "Item Name",
  "Quantity",
  "Unit",
  "Unit Price",
  "Total",
  "Note",
];

export type PartyImportResult = {
  success: boolean;
  imported: number;
  errors: string[];
};

function readRows(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Import supplier arrivals from an Excel file */
export async function importArrivalsFromExcel(file: File): Promise<PartyImportResult> {
  const rows = await readRows(file);
  const result: PartyImportResult = { success: false, imported: 0, errors: [] };

  if (rows.length < 2) {
    result.errors.push("File is empty or has no data rows.");
    return result;
  }

  const suppliers = await db.suppliers.toArray();
  const supByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s]));
  const now = Date.now();

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || cells.every((c) => !String(c).trim())) continue;

    const partyName = String(cells[0] ?? "").trim();
    const itemName = String(cells[1] ?? "").trim();
    const qty = parseFloat(String(cells[2] ?? "0")) || 0;
    const unit = String(cells[3] ?? "").trim();
    const unitPrice = parseFloat(String(cells[4] ?? "0")) || 0;
    let total = parseFloat(String(cells[5] ?? "0")) || 0;
    const note = String(cells[6] ?? "").trim();

    if (!partyName) { result.errors.push(`Row ${i + 1}: Party Name is required.`); continue; }
    if (!itemName) { result.errors.push(`Row ${i + 1}: Item Name is required.`); continue; }

    const supplier = supByName.get(partyName.toLowerCase());
    if (!supplier) { result.errors.push(`Row ${i + 1}: Supplier "${partyName}" not found.`); continue; }

    if (!total && qty && unitPrice) total = qty * unitPrice;
    if (!total) { result.errors.push(`Row ${i + 1}: Total is zero.`); continue; }

    const arrival: SupplierArrival = {
      id: makeId("arr"),
      supplierId: supplier.id,
      itemName,
      qty,
      unit: unit || undefined,
      unitPrice,
      total: Math.round(total),
      note: note || undefined,
      createdAt: now,
    };
    await db.supplierArrivals.put(arrival);
    // Update supplier balance
    await db.suppliers.update(supplier.id, { totalBalance: supplier.totalBalance + Math.round(total) });
    supplier.totalBalance += Math.round(total); // keep in-memory copy updated
    result.imported++;
  }

  result.success = result.imported > 0;
  return result;
}

/** Import export sales from an Excel file */
export async function importExportSalesFromExcel(file: File): Promise<PartyImportResult> {
  const rows = await readRows(file);
  const result: PartyImportResult = { success: false, imported: 0, errors: [] };

  if (rows.length < 2) {
    result.errors.push("File is empty or has no data rows.");
    return result;
  }

  const customers = await db.exportCustomers.toArray();
  const custByName = new Map(customers.map((c) => [c.name.toLowerCase(), c]));
  const now = Date.now();

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || cells.every((c) => !String(c).trim())) continue;

    const partyName = String(cells[0] ?? "").trim();
    const itemName = String(cells[1] ?? "").trim();
    const qty = parseFloat(String(cells[2] ?? "0")) || 0;
    const unit = String(cells[3] ?? "").trim();
    const unitPrice = parseFloat(String(cells[4] ?? "0")) || 0;
    let total = parseFloat(String(cells[5] ?? "0")) || 0;
    const note = String(cells[6] ?? "").trim();

    if (!partyName) { result.errors.push(`Row ${i + 1}: Party Name is required.`); continue; }
    if (!itemName) { result.errors.push(`Row ${i + 1}: Item Name is required.`); continue; }

    const customer = custByName.get(partyName.toLowerCase());
    if (!customer) { result.errors.push(`Row ${i + 1}: Buyer "${partyName}" not found.`); continue; }

    if (!total && qty && unitPrice) total = qty * unitPrice;
    if (!total) { result.errors.push(`Row ${i + 1}: Total is zero.`); continue; }

    const sale: ExportSale = {
      id: makeId("es"),
      customerId: customer.id,
      itemName,
      qty,
      unit: unit || undefined,
      unitPrice,
      total: Math.round(total),
      note: note || undefined,
      createdAt: now,
    };
    await db.exportSales.put(sale);
    // Update customer balance
    await db.exportCustomers.update(customer.id, { totalBalance: customer.totalBalance + Math.round(total) });
    customer.totalBalance += Math.round(total);
    result.imported++;
  }

  result.success = result.imported > 0;
  return result;
}

/** Generate a sample/template Excel file for download */
export function downloadImportTemplate(type: "arrivals" | "sales") {
  const ws = XLSX.utils.aoa_to_sheet([
    EXPECTED_HEADERS,
    [type === "arrivals" ? "Supplier Name" : "Buyer Name", "Rice", "50", "kg", "100", "", "sample note"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type === "arrivals" ? "Arrivals" : "Sales");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type}_import_template.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
