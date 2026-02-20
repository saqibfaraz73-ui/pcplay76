import { db } from "@/db/appDb";
import type { DeliveryCustomer } from "@/db/schema";
import { format } from "date-fns";
import * as XLSX from "xlsx";


function makeId(prefix: string) {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto 
    ? (crypto as any).randomUUID() 
    : Math.random().toString(16).slice(2);
  return `${prefix}_${rand}_${Date.now().toString(16)}`;
}

export async function saveDeliveryCustomer(args: {
  name: string;
  phone?: string;
  address?: string;
}): Promise<DeliveryCustomer | null> {
  const name = args.name.trim();
  if (!name) return null;

  // Check if customer with same name already exists
  const existing = await db.deliveryCustomers
    .filter((c) => c.name.toLowerCase() === name.toLowerCase())
    .first();

  if (existing) {
    // Update with new info if provided
    const updated: DeliveryCustomer = {
      ...existing,
      phone: args.phone?.trim() || existing.phone,
      address: args.address?.trim() || existing.address,
    };
    await db.deliveryCustomers.put(updated);
    return updated;
  }

  // Create new customer
  const customer: DeliveryCustomer = {
    id: makeId("dc"),
    name,
    phone: args.phone?.trim() || undefined,
    address: args.address?.trim() || undefined,
    createdAt: Date.now(),
  };
  await db.deliveryCustomers.put(customer);
  return customer;
}

export async function exportDeliveryCustomersToExcel(): Promise<Blob> {
  const customers = await db.deliveryCustomers.orderBy("createdAt").toArray();

  const headers = ["Name", "Phone", "Address", "Added On"];
  const rows: (string | number)[][] = [headers];

  for (const c of customers) {
    rows.push([
      c.name,
      c.phone ?? "",
      c.address ?? "",
      format(new Date(c.createdAt), "yyyy-MM-dd HH:mm"),
    ]);
  }

  // Create workbook and worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Delivery Customers");

  // Generate Excel file as blob
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}


/** Share Excel file via native share sheet or browser download on web */
export async function downloadExcel(blob: Blob, filename: string) {
  const { shareFileBlob } = await import("@/features/pos/share-utils");
  await shareFileBlob(blob, filename);
}
