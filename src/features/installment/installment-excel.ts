import * as XLSX from "xlsx";
import { makeId } from "@/features/admin/id";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";

export function exportInstallmentExcel(customers: InstallmentCustomer[], payments: InstallmentPayment[]): Blob {
  const wb = XLSX.utils.book_new();

  // Customers sheet
  const custData = customers.map(c => ({
    "Name": c.name,
    "Phone": c.phone,
    "Address": c.address ?? "",
    "WhatsApp": c.whatsapp ?? "",
    "Email": c.email ?? "",
    "Product": c.productName,
    "Market Price": c.marketPrice ?? "",
    "Profit Type": c.profitType,
    "Profit Value": c.profitValue,
    "Tenure (Months)": c.tenureMonths,
    "Monthly Installment": c.monthlyInstallment,
    "Total Price": c.totalPrice,
    "Balance": c.totalBalance,
    "Due Date (Day)": c.dueDate ?? "",
    "Late Fee/Day": c.lateFeePerDay ?? "",
    "Agent": c.agentName ?? "",
  }));
  const ws1 = XLSX.utils.json_to_sheet(custData);
  XLSX.utils.book_append_sheet(wb, ws1, "Customers");

  // Payments sheet
  const payData = payments.map(p => {
    const c = customers.find(cu => cu.id === p.customerId);
    return {
      "Receipt #": p.receiptNo ?? "",
      "Customer": c?.name ?? "",
      "Amount": p.amount,
      "Late Fee": p.lateFeeAmount ?? 0,
      "Balance Before": p.balanceBefore,
      "Balance After": p.balanceAfter,
      "Month": p.month,
      "Agent": p.agentName,
      "Date": new Date(p.createdAt).toLocaleDateString(),
      "Note": p.note ?? "",
    };
  });
  const ws2 = XLSX.utils.json_to_sheet(payData);
  XLSX.utils.book_append_sheet(wb, ws2, "Payments");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadSampleExcel(): Blob {
  const wb = XLSX.utils.book_new();
  const sample = [
    {
      "Name": "Ahmed Khan",
      "Phone": "03001234567",
      "Address": "Lahore",
      "WhatsApp": "+923001234567",
      "Email": "ahmed@email.com",
      "Product": "Samsung Galaxy S24",
      "Market Price": 150000,
      "Profit Type": "percent",
      "Profit Value": 20,
      "Tenure (Months)": 12,
      "Due Date (Day)": 15,
      "Late Fee/Day": 50,
    },
    {
      "Name": "Ali Raza",
      "Phone": "03009876543",
      "Address": "Karachi",
      "WhatsApp": "",
      "Email": "",
      "Product": "Honda CD70",
      "Market Price": 180000,
      "Profit Type": "fixed",
      "Profit Value": 30000,
      "Tenure (Months)": 24,
      "Due Date (Day)": 10,
      "Late Fee/Day": 100,
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  XLSX.utils.book_append_sheet(wb, ws, "Customers");

  // Instructions sheet
  const instructions = [
    { "Field": "Name", "Required": "Yes", "Description": "Customer full name" },
    { "Field": "Phone", "Required": "Yes", "Description": "Customer phone number" },
    { "Field": "Address", "Required": "No", "Description": "Customer address" },
    { "Field": "WhatsApp", "Required": "No", "Description": "WhatsApp number with country code" },
    { "Field": "Email", "Required": "No", "Description": "Customer email" },
    { "Field": "Product", "Required": "Yes", "Description": "Product name" },
    { "Field": "Market Price", "Required": "No", "Description": "Market price of product" },
    { "Field": "Profit Type", "Required": "Yes", "Description": "'percent' or 'fixed'" },
    { "Field": "Profit Value", "Required": "Yes", "Description": "Profit percentage or fixed amount" },
    { "Field": "Tenure (Months)", "Required": "Yes", "Description": "Number of months" },
    { "Field": "Due Date (Day)", "Required": "No", "Description": "Day of month (1-28) when installment is due" },
    { "Field": "Late Fee/Day", "Required": "No", "Description": "Per-day late fee charge" },
  ];
  const ws2 = XLSX.utils.json_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, ws2, "Instructions");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function importInstallmentExcel(file: File): Promise<InstallmentCustomer[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws);
  const now = Date.now();

  return rows.map((r: any) => {
    const name = String(r["Name"] ?? "").trim();
    const phone = String(r["Phone"] ?? "").trim();
    const productName = String(r["Product"] ?? "").trim();
    if (!name || !phone || !productName) throw new Error(`Row missing Name, Phone, or Product: ${JSON.stringify(r)}`);

    const marketPrice = Number(r["Market Price"]) || 0;
    const profitType = (String(r["Profit Type"] ?? "percent").toLowerCase() === "fixed" ? "fixed" : "percent") as "fixed" | "percent";
    const profitValue = Number(r["Profit Value"]) || 0;
    const tenureMonths = Number(r["Tenure (Months)"]) || 12;
    const totalPrice = profitType === "percent"
      ? Math.round(marketPrice * (1 + profitValue / 100))
      : marketPrice + profitValue;
    const monthlyInstallment = tenureMonths > 0 ? Math.round(totalPrice / tenureMonths) : totalPrice;

    return {
      id: makeId("inst"),
      name,
      phone,
      address: String(r["Address"] ?? "").trim() || undefined,
      whatsapp: String(r["WhatsApp"] ?? "").trim() || undefined,
      email: String(r["Email"] ?? "").trim() || undefined,
      productName,
      marketPrice: marketPrice || undefined,
      profitType,
      profitValue,
      tenureMonths,
      monthlyInstallment,
      totalPrice,
      totalBalance: totalPrice,
      dueDate: Number(r["Due Date (Day)"]) || undefined,
      lateFeePerDay: Number(r["Late Fee/Day"]) || undefined,
      createdAt: now,
    } satisfies InstallmentCustomer;
  });
}

/** Export agent's payment data as JSON for upload to admin */
export function exportAgentData(payments: InstallmentPayment[], agentName: string): Blob {
  const data = { agentName, exportedAt: Date.now(), payments };
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

/** Import agent payment data from JSON file */
export async function importAgentData(file: File): Promise<{ agentName: string; payments: InstallmentPayment[] }> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data.payments || !Array.isArray(data.payments)) throw new Error("Invalid agent data file");
  return { agentName: data.agentName, payments: data.payments };
}
