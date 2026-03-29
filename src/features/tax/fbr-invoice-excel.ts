import * as XLSX from "xlsx";
import type { Settings } from "@/db/schema";

type InvoiceData = {
  invoiceNo: string;
  buyerNtn: string;
  buyerCnic: string;
  buyerName: string;
  buyerPhone: string;
  lines: { name: string; qty: number; unitPrice: number; pctCode: string }[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  furtherTaxEnabled: boolean;
  furtherTaxPercent: number;
  furtherTax: number;
  grandTotal: number;
  createdAt: number;
};

export async function generateFbrInvoiceExcel(data: InvoiceData, settings: Settings) {
  const curr = settings.currencySymbol || "Rs";
  const ntn = settings.fbrNtn || settings.taxApiBusinessNtn || "";
  const posId = settings.fbrPosId || settings.taxApiPosId || "";
  const bizName = settings.fbrBusinessName || settings.restaurantName || "";
  const dt = new Date(data.createdAt);
  const dateStr = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;

  const usin = `${posId}-${String(data.invoiceNo).padStart(6, "0")}`;

  const rows: any[][] = [];

  // Header info
  rows.push(["FBR Tax Invoice"]);
  rows.push(["Business Name", bizName]);
  rows.push(["NTN", ntn]);
  rows.push(["POS ID", posId]);
  rows.push(["USIN", usin]);
  rows.push(["Invoice No.", data.invoiceNo]);
  rows.push(["Date/Time", dateStr]);
  rows.push(["Buyer Name", data.buyerName || ""]);
  rows.push(["Buyer NTN", data.buyerNtn || ""]);
  rows.push(["Buyer CNIC", data.buyerCnic || ""]);
  rows.push(["Buyer Phone", data.buyerPhone || ""]);
  rows.push([]);

  // Item headers
  rows.push(["#", "Item Name", "PCT/HS Code", "Qty", "Unit Price", "Sale Value", "Tax Rate %", "Tax Charged", "Further Tax", "Total Amount"]);

  data.lines.forEach((l, i) => {
    if (!l.name) return;
    const saleValue = l.qty * l.unitPrice;
    const taxCharged = data.taxPercent > 0 ? Math.round(saleValue * data.taxPercent / 100) : 0;
    const furtherTaxAmt = data.furtherTaxEnabled ? Math.round(saleValue * data.furtherTaxPercent / 100) : 0;
    const totalAmt = saleValue + taxCharged + furtherTaxAmt;

    rows.push([
      i + 1,
      l.name,
      l.pctCode || "",
      l.qty,
      l.unitPrice,
      saleValue,
      data.taxPercent,
      taxCharged,
      furtherTaxAmt,
      totalAmt,
    ]);
  });

  rows.push([]);
  rows.push(["", "", "", "", "", "Subtotal:", "", `${curr} ${data.subtotal}`]);
  if (data.taxPercent > 0) {
    rows.push(["", "", "", "", "", `${settings.taxLabel || "Tax"} (${data.taxPercent}%):`, "", `${curr} ${data.taxAmount}`]);
  }
  if (data.furtherTaxEnabled) {
    rows.push(["", "", "", "", "", `Further Tax (${data.furtherTaxPercent}%):`, "", `${curr} ${data.furtherTax}`]);
  }
  rows.push(["", "", "", "", "", "Grand Total:", "", `${curr} ${data.grandTotal}`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 4 }, { wch: 22 }, { wch: 14 }, { wch: 6 }, { wch: 12 },
    { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "FBR Invoice");
  XLSX.writeFile(wb, `FBR_Invoice_${data.invoiceNo}.xlsx`);
}
