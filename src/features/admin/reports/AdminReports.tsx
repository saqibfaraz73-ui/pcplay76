import React from "react";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db/appDb";
import type { CreditCustomer, DeliveryPerson, Expense, ExportCustomer, ExportSale, MenuItem, Order, RestaurantTable, Settings, TableOrder, Waiter, WorkPeriod } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { formatIntMoney } from "@/features/pos/format";
import { writePdfFile, shareFile } from "@/features/files/sangi-folders";
import { SalesReportPreview } from "@/features/admin/reports/SalesReportPreview";

function toDateInputValue(ts: number) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function parseDateInput(value: string): number {
  const [y, m, d] = value.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return Date.now();
  return new Date(y, m - 1, d).getTime();
}

/** Build PDF that matches the in-app SalesReportPreview layout exactly */
function buildSalesPdf(args: {
  restaurantName: string;
  from: number;
  to: number;
  orders: Order[];
  customers: CreditCustomer[];
  deliveryPersons: DeliveryPerson[];
  items: MenuItem[];
  expenses: Expense[];
  tableOrders: TableOrder[];
  tables: RestaurantTable[];
  waiters: Waiter[];
  settings: Settings | null;
  exportSales?: ExportSale[];
  exportCustomers?: ExportCustomer[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 40;
  const right = pageWidth - 40;
  const contentWidth = right - left;
  let y = 48;
  const lineH = 14;
  const pageHeight = 780;

  const checkPage = (needed = lineH * 2) => {
    if (y + needed > pageHeight) {
      doc.addPage();
      y = 48;
    }
  };

  const heading = (text: string) => {
    checkPage(40);
    y += 8;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(text, left, y);
    y += 16;
  };

  const row = (label: string, value: string, bold = false, color?: [number, number, number]) => {
    checkPage();
    doc.setFontSize(9);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    if (color) doc.setTextColor(...color); else doc.setTextColor(0);
    doc.text(label, left + 4, y);
    doc.text(value, right - 4, y, { align: "right" });
    y += lineH;
    doc.setTextColor(0);
  };

  const separator = () => {
    doc.setDrawColor(200);
    doc.line(left, y - 4, right, y - 4);
  };

  const completed = args.orders.filter((o) => o.status === "completed");
  const cancelled = args.orders.filter((o) => o.status === "cancelled");

  const customersById = Object.fromEntries(args.customers.map((c) => [c.id, c]));
  const deliveryPersonsById = Object.fromEntries(args.deliveryPersons.map((p) => [p.id, p]));
  const itemsById = Object.fromEntries(args.items.map((i) => [i.id, i]));
  const tablesById = Object.fromEntries(args.tables.map((t) => [t.id, t]));
  const waitersById = Object.fromEntries(args.waiters.map((w) => [w.id, w]));

  const completedTableOrders = args.tableOrders.filter((o) => o.status === "completed");
  const cancelledTableOrders = args.tableOrders.filter((o) => o.status === "cancelled");

  // Categorize regular orders
  const takeawayCompleted = completed.filter((o) => o.paymentMethod === "cash");
  const takeawayCancelled = cancelled.filter((o) => o.paymentMethod === "cash");
  const deliveryCompleted = completed.filter((o) => o.paymentMethod === "delivery");
  const deliveryCancelled = cancelled.filter((o) => o.paymentMethod === "delivery");
  const creditCompleted = completed.filter((o) => o.paymentMethod === "credit");
  const creditCancelled = cancelled.filter((o) => o.paymentMethod === "credit");

  const takeawayTotal = takeawayCompleted.reduce((s, o) => s + o.total, 0);
  const takeawayDiscount = takeawayCompleted.reduce((s, o) => s + o.discountTotal, 0);
  const takeawayCancelledTotal = takeawayCancelled.reduce((s, o) => s + o.total, 0);
  
  const deliveryTotal = deliveryCompleted.reduce((s, o) => s + o.total, 0);
  const deliveryDiscount = deliveryCompleted.reduce((s, o) => s + o.discountTotal, 0);
  const deliveryCancelledTotal = deliveryCancelled.reduce((s, o) => s + o.total, 0);

  const tableSalesTotal = completedTableOrders.reduce((s, o) => s + o.total, 0);
  const tableDiscount = completedTableOrders.reduce((s, o) => s + o.discountTotal, 0);
  const tableCancelledTotal = cancelledTableOrders.reduce((s, o) => s + o.total, 0);

  const creditTotal = creditCompleted.reduce((s, o) => s + o.total, 0);
  const creditDiscount = creditCompleted.reduce((s, o) => s + o.discountTotal, 0);
  const creditCancelledTotal = creditCancelled.reduce((s, o) => s + o.total, 0);
  // Table credit orders
  const tableCreditCompleted = completedTableOrders.filter((o) => o.paymentMethod === "credit");
  const tableCreditCancelled = cancelledTableOrders.filter((o) => o.paymentMethod === "credit");
  const tableCreditTotal = tableCreditCompleted.reduce((s, o) => s + o.total, 0);
  const tableCreditDiscount = tableCreditCompleted.reduce((s, o) => s + o.discountTotal, 0);
  const tableCreditCancelledTotal = tableCreditCancelled.reduce((s, o) => s + o.total, 0);

  // Export sales
  const showExport = args.settings?.showExportInReports ?? false;
  const exportSalesData = args.exportSales ?? [];
  const exportCustomersData = args.exportCustomers ?? [];
  const exportCompleted = exportSalesData.filter((s) => !s.cancelled);
  const exportCancelled = exportSalesData.filter((s) => s.cancelled);
  const exportTotal = exportCompleted.reduce((s, e) => s + e.total, 0);
  const exportCancelledTotal = exportCancelled.reduce((s, e) => s + e.total, 0);
  const exportCustomersById = Object.fromEntries(exportCustomersData.map((c) => [c.id, c]));

  const overallSales = takeawayTotal + deliveryTotal + tableSalesTotal + creditTotal + tableCreditTotal + (showExport ? exportTotal : 0);
  const overallDiscount = takeawayDiscount + deliveryDiscount + tableDiscount + creditDiscount + tableCreditDiscount;
  const totalExpenses = args.expenses.reduce((s, e) => s + e.amount, 0);

  const totalCreditSales = creditTotal + tableCreditTotal;
  const totalCreditDiscount = creditDiscount + tableCreditDiscount;
  const totalCreditCancelled = creditCancelledTotal + tableCreditCancelledTotal;
  const totalCancelledAmount = takeawayCancelledTotal + deliveryCancelledTotal + tableCancelledTotal + totalCreditCancelled + (showExport ? exportCancelledTotal : 0);
  const remainingBalance = overallSales - overallDiscount - totalExpenses;

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Sales Report", left, y);
  y += 20;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${args.restaurantName} • ${toDateInputValue(args.from)} → ${toDateInputValue(args.to)}`, left, y);
  y += 24;

  // ===== SUMMARY BOXES =====
  const deliveryEnabled = args.settings?.deliveryEnabled ?? true;
  const tableEnabled = args.settings?.tableManagementEnabled ?? true;

  const boxData: { label: string; value: string; color?: [number, number, number] }[] = [
    { label: "Total Sales", value: formatIntMoney(overallSales) },
    { label: "Take Away Sales", value: formatIntMoney(takeawayTotal) },
    ...(deliveryEnabled ? [{ label: "Delivery Sales", value: formatIntMoney(deliveryTotal) }] : []),
    ...(tableEnabled ? [{ label: "Table Sales", value: formatIntMoney(tableSalesTotal) }] : []),
    { label: "Credit Sales", value: formatIntMoney(totalCreditSales) },
    ...(showExport ? [{ label: "Export Sales", value: formatIntMoney(exportTotal) }] : []),
    { label: "Total Cancelled", value: formatIntMoney(totalCancelledAmount), color: [200, 0, 0] as [number, number, number] },
    { label: "Total Discount", value: formatIntMoney(overallDiscount), color: [200, 0, 0] as [number, number, number] },
    { label: "Total Expenses", value: formatIntMoney(totalExpenses), color: [200, 0, 0] as [number, number, number] },
    { label: "Remaining Balance", value: formatIntMoney(remainingBalance), color: remainingBalance >= 0 ? [0, 120, 0] as [number, number, number] : [200, 0, 0] as [number, number, number] },
  ];

  const cols = 4;
  const boxW = (contentWidth - (cols - 1) * 8) / cols;
  const boxH = 44;
  const rows = Math.ceil(boxData.length / cols);

  for (let r = 0; r < rows; r++) {
    checkPage(boxH + 12);
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= boxData.length) break;
      const bx = left + c * (boxW + 8);
      const by = y;
      // Draw box border
      doc.setDrawColor(180);
      doc.setFillColor(248, 248, 248);
      doc.roundedRect(bx, by, boxW, boxH, 3, 3, "FD");
      // Label
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text(boxData[idx].label, bx + 6, by + 14);
      // Value
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      if (boxData[idx].color) doc.setTextColor(...boxData[idx].color!);
      else doc.setTextColor(0);
      doc.text(boxData[idx].value, bx + 6, by + 32);
      doc.setTextColor(0);
    }
    y += boxH + 8;
  }
  y += 8;

  // ===== TAKEAWAY SALES =====
  heading("Takeaway Sales");
  row("Takeaway Sales Total", formatIntMoney(takeawayTotal), true);
  row("Discounts", formatIntMoney(takeawayDiscount));
  if (takeawayCancelled.length > 0) {
    row(`Cancelled Orders (${takeawayCancelled.length})`, formatIntMoney(takeawayCancelledTotal), false, [200, 0, 0]);
  }

  // ===== DELIVERY SALES =====
  if (deliveryEnabled && (deliveryCompleted.length > 0 || deliveryCancelled.length > 0)) {
    heading("Delivery Sales");
    row("Delivery Sales Total", formatIntMoney(deliveryTotal), true);
    row("Discounts", formatIntMoney(deliveryDiscount));
    if (deliveryCancelled.length > 0) {
      row(`Cancelled Orders (${deliveryCancelled.length})`, formatIntMoney(deliveryCancelledTotal), false, [200, 0, 0]);
    }

    // By delivery person
    const byPerson: Record<string, { total: number; discount: number; cancelled: number; cancelCount: number }> = {};
    for (const o of deliveryCompleted) {
      const pid = o.deliveryPersonId ?? "unknown";
      if (!byPerson[pid]) byPerson[pid] = { total: 0, discount: 0, cancelled: 0, cancelCount: 0 };
      byPerson[pid].total += o.total;
      byPerson[pid].discount += o.discountTotal;
    }
    for (const o of deliveryCancelled) {
      const pid = o.deliveryPersonId ?? "unknown";
      if (!byPerson[pid]) byPerson[pid] = { total: 0, discount: 0, cancelled: 0, cancelCount: 0 };
      byPerson[pid].cancelled += o.total;
      byPerson[pid].cancelCount += 1;
    }
    for (const [pid, data] of Object.entries(byPerson)) {
      y += 4;
      const name = deliveryPersonsById[pid]?.name ?? pid;
      row(`Sales By ${name}`, formatIntMoney(data.total), true);
      if (data.cancelCount > 0) row(`  Cancelled (${data.cancelCount})`, formatIntMoney(data.cancelled), false, [200, 0, 0]);
      if (data.discount > 0) row(`  Discounts`, formatIntMoney(data.discount));
    }
  }

  // ===== TABLE SALES =====
  if (tableEnabled && (completedTableOrders.length > 0 || cancelledTableOrders.length > 0)) {
    heading("Table Sales");
    row("Tables Total Sales", formatIntMoney(tableSalesTotal), true);
    row("Discounts", formatIntMoney(tableDiscount));
    if (cancelledTableOrders.length > 0) {
      row(`Cancelled Orders (${cancelledTableOrders.length})`, formatIntMoney(tableCancelledTotal), false, [200, 0, 0]);
    }

    // By waiter
    const byWaiter: Record<string, { total: number; discount: number; cancelled: number; cancelCount: number }> = {};
    for (const o of completedTableOrders) {
      const wid = o.waiterId;
      if (!byWaiter[wid]) byWaiter[wid] = { total: 0, discount: 0, cancelled: 0, cancelCount: 0 };
      byWaiter[wid].total += o.total;
      byWaiter[wid].discount += o.discountTotal;
    }
    for (const o of cancelledTableOrders) {
      const wid = o.waiterId;
      if (!byWaiter[wid]) byWaiter[wid] = { total: 0, discount: 0, cancelled: 0, cancelCount: 0 };
      byWaiter[wid].cancelled += o.total;
      byWaiter[wid].cancelCount += 1;
    }
    for (const [wid, data] of Object.entries(byWaiter)) {
      y += 4;
      const name = waitersById[wid]?.name ?? wid;
      row(`Sales By ${name}`, formatIntMoney(data.total), true);
      if (data.cancelCount > 0) row(`  Cancelled (${data.cancelCount})`, formatIntMoney(data.cancelled), false, [200, 0, 0]);
      if (data.discount > 0) row(`  Discounts`, formatIntMoney(data.discount));
    }
  }

  // ===== CREDIT SALES =====
  const allCreditCompleted = [...creditCompleted, ...tableCreditCompleted];
  const allCreditCancelled = [...creditCancelled, ...tableCreditCancelled];

  if (allCreditCompleted.length > 0 || allCreditCancelled.length > 0) {
    heading("Credit Sales");
    row("Total Credit Sales", formatIntMoney(totalCreditSales), true);
    row("Discounts", formatIntMoney(totalCreditDiscount));
    if (allCreditCancelled.length > 0) {
      row(`Cancelled (${allCreditCancelled.length})`, formatIntMoney(totalCreditCancelled), false, [200, 0, 0]);
    }

    // By customer
    const byCust: Record<string, { total: number; discount: number; cancelled: number; cancelCount: number; lines: Record<string, { name: string; qty: number; total: number }> }> = {};
    const addCreditOrders = (list: Array<any>, status: "completed" | "cancelled") => {
      for (const o of list) {
        const cid = o.creditCustomerId;
        if (!cid) continue;
        if (!byCust[cid]) byCust[cid] = { total: 0, discount: 0, cancelled: 0, cancelCount: 0, lines: {} };
        if (status === "completed") {
          byCust[cid].total += o.total;
          byCust[cid].discount += o.discountTotal;
          for (const l of o.lines) {
            const existing = byCust[cid].lines[l.itemId];
            byCust[cid].lines[l.itemId] = {
              name: l.name,
              qty: (existing?.qty ?? 0) + l.qty,
              total: (existing?.total ?? 0) + l.subtotal,
            };
          }
        } else {
          byCust[cid].cancelled += o.total;
          byCust[cid].cancelCount += 1;
        }
      }
    };
    addCreditOrders(creditCompleted, "completed");
    addCreditOrders(tableCreditCompleted, "completed");
    addCreditOrders(creditCancelled, "cancelled");
    addCreditOrders(tableCreditCancelled, "cancelled");

    for (const [cid, data] of Object.entries(byCust).sort((a, b) =>
      (customersById[a[0]]?.name ?? "").localeCompare(customersById[b[0]]?.name ?? "")
    )) {
      y += 4;
      const name = customersById[cid]?.name ?? cid;
      row(`${name} Sales`, formatIntMoney(data.total), true);
      if (data.discount > 0) row(`  Discounts`, formatIntMoney(data.discount));
      if (data.cancelCount > 0) row(`  Cancelled (${data.cancelCount})`, formatIntMoney(data.cancelled), false, [200, 0, 0]);
    }
  }

  // ===== EXPORT SALES =====
  if (showExport && exportCompleted.length > 0) {
    heading("Export Sales");
    row("Export Sales Total", formatIntMoney(exportTotal), true);
    if (exportCancelled.length > 0) {
      row(`Cancelled (${exportCancelled.length})`, formatIntMoney(exportCancelledTotal), false, [200, 0, 0]);
    }

    // By customer
    const byExpCust: Record<string, { total: number; count: number }> = {};
    for (const s of exportCompleted) {
      if (!byExpCust[s.customerId]) byExpCust[s.customerId] = { total: 0, count: 0 };
      byExpCust[s.customerId].total += s.total;
      byExpCust[s.customerId].count += 1;
    }
    y += 4;
    for (const [cid, data] of Object.entries(byExpCust).sort((a, b) =>
      (exportCustomersById[a[0]]?.name ?? "").localeCompare(exportCustomersById[b[0]]?.name ?? "")
    )) {
      const name = exportCustomersById[cid]?.name ?? cid;
      row(`${name} (${data.count})`, formatIntMoney(data.total));
    }
  }

  // ===== OVERALL SUMMARY =====
  heading("Overall Summary");
  separator();
  row("Takeaway Sales", formatIntMoney(takeawayTotal));
  if (deliveryEnabled) row("Delivery Sales", formatIntMoney(deliveryTotal));
  if (tableEnabled) row("Table Sales", formatIntMoney(tableSalesTotal));
  row("Credit Sales", formatIntMoney(totalCreditSales));
  if (showExport) row("Export Sales", formatIntMoney(exportTotal));
  y += 4;
  row("Overall Sales", formatIntMoney(overallSales), true);
  row("Minus Overall Discounts", `-${formatIntMoney(overallDiscount)}`, false, [200, 0, 0]);
  row("Minus Expenses", `-${formatIntMoney(totalExpenses)}`, false, [200, 0, 0]);
  y += 4;
  separator();
  row("= Remaining Balance", formatIntMoney(overallSales - overallDiscount - totalExpenses), true);

  // ===== EXPENSES DETAIL =====
  if (args.expenses.length > 0) {
    heading("Expenses");
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
    doc.text("#", left + 4, y);
    doc.text("Expense", left + 24, y);
    doc.text("Amount", left + contentWidth * 0.65, y);
    doc.text("Date", right - 10, y, { align: "right" });
    y += 10;
    separator();

    doc.setFont("helvetica", "normal"); doc.setTextColor(0);
    args.expenses.forEach((e, idx) => {
      checkPage();
      doc.setFontSize(9);
      doc.text(String(idx + 1), left + 4, y);
      const label = e.note ? `${e.name} (${e.note})` : e.name;
      doc.text(label.slice(0, 45), left + 24, y);
      doc.text(formatIntMoney(e.amount), left + contentWidth * 0.65, y);
      doc.text(new Date(e.createdAt).toLocaleDateString(), right - 10, y, { align: "right" });
      y += lineH;
    });
  }

  // ===== ITEMS SALES =====
  const byItem: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
  const addLines = (list: Array<{ lines: Array<{ itemId: string; name: string; qty: number; unitPrice: number; subtotal: number }> }>) => {
    for (const o of list) {
      for (const l of o.lines) {
        const item = itemsById[l.itemId];
        const buying = item?.buyingPrice ?? 0;
        if (!byItem[l.itemId]) byItem[l.itemId] = { name: l.name, qty: 0, revenue: 0, profit: 0 };
        byItem[l.itemId].qty += l.qty;
        byItem[l.itemId].revenue += l.subtotal;
        if (item?.buyingPrice != null) byItem[l.itemId].profit += (l.unitPrice - buying) * l.qty;
      }
    }
  };
  addLines(completed);
  addLines(completedTableOrders);
  const itemsSales = Object.values(byItem).sort((a, b) => b.revenue - a.revenue);

  if (itemsSales.length > 0) {
    const printItemsHeader = () => {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("Item", left + 4, y);
      doc.text("Qty", left + contentWidth * 0.5, y);
      doc.text("Revenue", left + contentWidth * 0.65, y);
      doc.text("Profit", left + contentWidth * 0.85, y);
      y += 10;
      separator();
      doc.setFont("helvetica", "normal"); doc.setTextColor(0);
    };

    heading("Items Sales Report");
    printItemsHeader();

    for (const r of itemsSales) {
      if (y + lineH * 2 > pageHeight) {
        doc.addPage();
        y = 48;
        printItemsHeader();
      }
      doc.setFontSize(9);
      doc.text(r.name.slice(0, 40), left + 4, y);
      doc.text(String(r.qty), left + contentWidth * 0.5, y);
      doc.text(formatIntMoney(r.revenue), left + contentWidth * 0.65, y);
      doc.text(formatIntMoney(r.profit), left + contentWidth * 0.85, y);
      y += lineH;
    }

    // Totals row
    const totalRevenue = itemsSales.reduce((s, r) => s + r.revenue, 0);
    const totalProfit = itemsSales.reduce((s, r) => s + r.profit, 0);
    const totalQty = itemsSales.reduce((s, r) => s + r.qty, 0);
    y += 4;
    separator();
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text("Total", left + 4, y);
    doc.text(String(totalQty), left + contentWidth * 0.5, y);
    doc.text(formatIntMoney(totalRevenue), left + contentWidth * 0.65, y);
    doc.text(formatIntMoney(totalProfit), left + contentWidth * 0.85, y);
    y += lineH;
  }

  return doc;
}

export function AdminReports() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [customers, setCustomers] = React.useState<CreditCustomer[]>([]);
  const [deliveryPersons, setDeliveryPersons] = React.useState<DeliveryPerson[]>([]);
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [workPeriods, setWorkPeriods] = React.useState<WorkPeriod[]>([]);
  const [tables, setTables] = React.useState<RestaurantTable[]>([]);
  const [waiters, setWaiters] = React.useState<Waiter[]>([]);
  const [exportCustomers, setExportCustomers] = React.useState<ExportCustomer[]>([]);

  const now = Date.now();
  const [filterType, setFilterType] = React.useState<"date" | "workPeriod">("date");
  const [from, setFrom] = React.useState(toDateInputValue(startOfDay(now)));
  const [to, setTo] = React.useState(toDateInputValue(endOfDay(now)));
  const [selectedWorkPeriodId, setSelectedWorkPeriodId] = React.useState<string>("");

  const [salesPreview, setSalesPreview] = React.useState<{ 
    loading: boolean; 
    orders: Order[]; 
    expenses: Expense[];
    tableOrders: TableOrder[];
    exportSales: ExportSale[];
  }>({
    loading: false,
    orders: [],
    expenses: [],
    tableOrders: [],
    exportSales: [],
  });

  const [lastExport, setLastExport] = React.useState<{
    title: string;
    fileName: string;
    path: string;
    uri: string;
  } | null>(null);

  React.useEffect(() => {
    (async () => {
      const [s, cs, dps, its, wps, tbls, wtrs, expCs] = await Promise.all([
        db.settings.get("app"),
        db.customers.orderBy("createdAt").toArray(),
        db.deliveryPersons.orderBy("createdAt").toArray(),
        db.items.orderBy("createdAt").toArray(),
        db.workPeriods.orderBy("startedAt").reverse().limit(50).toArray(),
        db.restaurantTables.orderBy("createdAt").toArray(),
        db.waiters.orderBy("createdAt").toArray(),
        db.exportCustomers.orderBy("createdAt").toArray(),
      ]);
      setSettings(s ?? null);
      setCustomers(cs);
      setDeliveryPersons(dps);
      setItems(its);
      setWorkPeriods(wps);
      setTables(tbls);
      setWaiters(wtrs);
      setExportCustomers(expCs);
    })();
  }, []);

  const fetchOrdersInRange = async (fromTs: number, toTs: number) => {
    const all = await db.orders.toArray();
    return all.filter((o) => o.createdAt >= fromTs && o.createdAt <= toTs);
  };

  const fetchExpensesInRange = async (fromTs: number, toTs: number) => {
    const all = await db.expenses.toArray();
    return all.filter((e) => e.createdAt >= fromTs && e.createdAt <= toTs);
  };

  const fetchTableOrdersInRange = async (fromTs: number, toTs: number) => {
    const all = await db.tableOrders.toArray();
    return all.filter((o) => o.createdAt >= fromTs && o.createdAt <= toTs);
  };

  const fetchOrdersByWorkPeriod = async (workPeriodId: string) => {
    const all = await db.orders.toArray();
    return all.filter((o) => o.workPeriodId === workPeriodId);
  };

  const fetchTableOrdersByWorkPeriod = async (workPeriodId: string) => {
    const all = await db.tableOrders.toArray();
    return all.filter((o) => o.workPeriodId === workPeriodId);
  };

  const fetchExpensesByWorkPeriod = async (workPeriodId: string) => {
    const wp = workPeriods.find((w) => w.id === workPeriodId);
    const all = await db.expenses.toArray();
    return all.filter((e) => {
      // Match by workPeriodId directly
      if (e.workPeriodId === workPeriodId) return true;
      // Fallback: include expenses created during the work period time range
      // (handles supplier payment expenses that may not have workPeriodId set)
      if (!e.workPeriodId && wp) {
        const end = wp.endedAt ?? Date.now();
        return e.createdAt >= wp.startedAt && e.createdAt <= end;
      }
      return false;
    });
  };

  const fetchExportSalesInRange = async (fromTs: number, toTs: number) => {
    const all = await db.exportSales.toArray();
    return all.filter((s) => s.createdAt >= fromTs && s.createdAt <= toTs);
  };

  const loadSalesPreview = async () => {
    try {
      setSalesPreview((p) => ({ ...p, loading: true }));
      
      let orders: Order[];
      let expenses: Expense[];
      let tableOrders: TableOrder[];
      let expSales: ExportSale[];
      if (filterType === "workPeriod" && selectedWorkPeriodId) {
        orders = await fetchOrdersByWorkPeriod(selectedWorkPeriodId);
        expenses = await fetchExpensesByWorkPeriod(selectedWorkPeriodId);
        tableOrders = await fetchTableOrdersByWorkPeriod(selectedWorkPeriodId);
        const wp = workPeriods.find((w) => w.id === selectedWorkPeriodId);
        expSales = wp ? await fetchExportSalesInRange(wp.startedAt, wp.endedAt ?? Date.now()) : [];
      } else {
        const fromTs = startOfDay(parseDateInput(from));
        const toTs = endOfDay(parseDateInput(to));
        orders = await fetchOrdersInRange(fromTs, toTs);
        expenses = await fetchExpensesInRange(fromTs, toTs);
        tableOrders = await fetchTableOrdersInRange(fromTs, toTs);
        expSales = await fetchExportSalesInRange(fromTs, toTs);
      }
      
      setSalesPreview({ loading: false, orders, expenses, tableOrders, exportSales: expSales });
    } catch (e: any) {
      setSalesPreview((p) => ({ ...p, loading: false }));
      toast({ title: "Preview failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const exportSales = async () => {
    try {
      let orders: Order[];
      let expenses: Expense[];
      let fromTs: number;
      let toTs: number;
      
      if (filterType === "workPeriod" && selectedWorkPeriodId) {
        orders = await fetchOrdersByWorkPeriod(selectedWorkPeriodId);
        expenses = await fetchExpensesByWorkPeriod(selectedWorkPeriodId);
        const wp = workPeriods.find((w) => w.id === selectedWorkPeriodId);
        fromTs = wp?.startedAt ?? now;
        toTs = wp?.endedAt ?? now;
      } else {
        fromTs = startOfDay(parseDateInput(from));
        toTs = endOfDay(parseDateInput(to));
        orders = await fetchOrdersInRange(fromTs, toTs);
        expenses = await fetchExpensesInRange(fromTs, toTs);
      }
      
      const tableOrders = filterType === "workPeriod" && selectedWorkPeriodId
        ? await fetchTableOrdersByWorkPeriod(selectedWorkPeriodId)
        : await fetchTableOrdersInRange(fromTs, toTs);

      const expSales = await fetchExportSalesInRange(fromTs, toTs);

      const doc = buildSalesPdf({
        restaurantName: settings?.restaurantName ?? "SANGI POS",
        from: fromTs,
        to: toTs,
        orders,
        customers,
        deliveryPersons,
        items,
        expenses,
        tableOrders,
        tables,
        waiters,
        settings,
        exportSales: expSales,
        exportCustomers,
      });
      const bytes = doc.output("arraybuffer");
      const fileName = `sales_${toDateInputValue(fromTs)}_${toDateInputValue(toTs)}.pdf`;
      const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
      setLastExport({ title: "Sales Report", fileName, path: saved.path, uri: saved.uri });
      toast({ title: "Sales report saved", description: fileName });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Sales Report Filter</CardTitle>
          <CardDescription>Filter by date range or work period.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={filterType} onValueChange={(v) => setFilterType(v as any)}>
            <TabsList>
              <TabsTrigger value="date">By Date Range</TabsTrigger>
              <TabsTrigger value="workPeriod">By Work Period</TabsTrigger>
            </TabsList>

            <TabsContent value="date" className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="from">From</Label>
                  <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to">To</Label>
                  <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="workPeriod" className="mt-4">
              <div className="space-y-2">
                <Label htmlFor="workPeriod">Select Work Period</Label>
                <select
                  id="workPeriod"
                  value={selectedWorkPeriodId}
                  onChange={(e) => setSelectedWorkPeriodId(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Select…</option>
                  {workPeriods.map((wp) => (
                    <option key={wp.id} value={wp.id}>
                      {wp.cashier} • {new Date(wp.startedAt).toLocaleString()}
                      {wp.endedAt ? ` → ${new Date(wp.endedAt).toLocaleTimeString()}` : " (active)"}
                    </option>
                  ))}
                </select>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void loadSalesPreview()} disabled={salesPreview.loading}>
              {salesPreview.loading ? "Loading…" : "View Report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <SalesReportPreview
        restaurantName={settings?.restaurantName ?? "SANGI POS"}
        fromLabel={from}
        toLabel={to}
        orders={salesPreview.orders}
        customers={customers}
        deliveryPersons={deliveryPersons}
        items={items}
        expenses={salesPreview.expenses}
        tableOrders={salesPreview.tableOrders}
        tables={tables}
        waiters={waiters}
        settings={settings}
        exportSales={salesPreview.exportSales}
        exportCustomers={exportCustomers}
      />

      <Card>
        <CardHeader>
          <CardTitle>PDF Export</CardTitle>
          <CardDescription>Export the sales report as PDF — matches the app view above (summary, credit customers, items sales).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void exportSales()}>Export PDF</Button>
          <Button
            variant="outline"
            disabled={!lastExport}
            onClick={() => lastExport && void shareFile({ title: lastExport.title, uri: lastExport.uri })}
          >
            Share PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
