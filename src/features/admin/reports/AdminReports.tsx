import React from "react";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db/appDb";
import type { Category, CreditCustomer, DeliveryPerson, Expense, ExportCustomer, ExportSale, MenuItem, Order, RestaurantTable, Settings, TableOrder, Waiter, WorkPeriod } from "@/db/schema";
import type { AdvanceOrder, BookingOrder } from "@/db/booking-schema";
import { useToast } from "@/hooks/use-toast";
import { formatIntMoney, fmtDate, fmtDateTime, fmtTime12, fmtDateShort, fmtDuration } from "@/features/pos/format";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { SalesReportPreview } from "@/features/admin/reports/SalesReportPreview";
import { useAuth } from "@/auth/AuthProvider";

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
  categories: Category[];
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
  advanceOrders?: AdvanceOrder[];
  bookingOrders?: BookingOrder[];
  workPeriod?: WorkPeriod;
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
  const categoriesById = Object.fromEntries(args.categories.map((c) => [c.id, c]));
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

  // Export sales — only count advance payments as revenue
  const showExport = args.settings?.showExportInReports ?? false;
  const exportSalesData = args.exportSales ?? [];
  const exportCustomersData = args.exportCustomers ?? [];
  const exportCompleted = exportSalesData.filter((s) => !s.cancelled);
  const exportCancelled = exportSalesData.filter((s) => s.cancelled);
  const exportAdvanceTotal = exportCompleted.reduce((s, e) => s + (e.advancePayment ?? 0), 0);
  const exportDiscount = exportCompleted.reduce((s, e) => s + (e.discountAmount ?? 0), 0);
  const exportGrossTotal = exportCompleted.reduce((s, e) => s + e.total, 0);
  const exportRemainingTotal = exportGrossTotal - exportDiscount - exportAdvanceTotal;
  const exportCancelledTotal = exportCancelled.reduce((s, e) => s + e.total, 0);
  const exportCustomersById = Object.fromEntries(exportCustomersData.map((c) => [c.id, c]));

  // Advance/Booking — sales = advance payments received only
  const showAdvBooking = (args.settings?.advanceBookingEnabled ?? false) && (args.settings?.showAdvanceBookingInReports ?? false);
  const advOrders = args.advanceOrders ?? [];
  const bkOrders = args.bookingOrders ?? [];
  const advCompleted = advOrders.filter((o) => o.status !== "cancelled");
  const advCancelled = advOrders.filter((o) => o.status === "cancelled");
  const advTotal = advCompleted.reduce((s, o) => s + o.advancePayment, 0);
  const advAdvanceTotal = advTotal;
  const advDiscount = advCompleted.reduce((s, o) => s + o.discountAmount, 0);
  const advCancelledTotal = advCancelled.reduce((s, o) => s + o.total, 0);
  const bkCompleted = bkOrders.filter((o) => o.status !== "cancelled");
  const bkCancelled = bkOrders.filter((o) => o.status === "cancelled");
  const bkTotal = bkCompleted.reduce((s, o) => s + o.advancePayment, 0);
  const bkAdvanceTotal = bkTotal;
  const bkDiscount = bkCompleted.reduce((s, o) => s + o.discountAmount, 0);
  const bkCancelledTotal = bkCancelled.reduce((s, o) => s + o.price, 0);
  const advBookingTotal = advTotal + bkTotal;

  const deliveryEnabled = args.settings?.deliveryEnabled ?? true;
  const tableEnabled = args.settings?.tableManagementEnabled ?? true;
  const salesDashboardEnabled = args.settings?.salesDashboardEnabled !== false;

  const overallSales = (salesDashboardEnabled ? takeawayTotal : 0) + (deliveryEnabled ? deliveryTotal : 0) + (tableEnabled ? tableSalesTotal : 0) + creditTotal + tableCreditTotal + (showExport ? exportAdvanceTotal : 0) + (showAdvBooking ? advBookingTotal : 0);
  const overallDiscount = (salesDashboardEnabled ? takeawayDiscount : 0) + (deliveryEnabled ? deliveryDiscount : 0) + (tableEnabled ? tableDiscount : 0) + creditDiscount + tableCreditDiscount + (showExport ? exportDiscount : 0) + (showAdvBooking ? advDiscount + bkDiscount : 0);
  const totalExpenses = args.expenses.reduce((s, e) => s + e.amount, 0);

  const totalCreditSales = creditTotal + tableCreditTotal;
  const totalCreditDiscount = creditDiscount + tableCreditDiscount;
  const totalCreditCancelled = creditCancelledTotal + tableCreditCancelledTotal;
  const totalCancelledAmount = (salesDashboardEnabled ? takeawayCancelledTotal : 0) + (deliveryEnabled ? deliveryCancelledTotal : 0) + (tableEnabled ? tableCancelledTotal : 0) + totalCreditCancelled + (showExport ? exportCancelledTotal : 0) + (showAdvBooking ? advCancelledTotal + bkCancelledTotal : 0);
  // Remaining balance = Total Sales - Expenses only (discounts & cancelled already excluded from total sales)
  const remainingBalance = overallSales - totalExpenses;

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Sales Report", left, y);
  y += 20;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${args.restaurantName} • ${fmtDateShort(args.from)} → ${fmtDateShort(args.to)}`, left, y);
  y += 16;

  // Work Period Info
  if (args.workPeriod) {
    const wp = args.workPeriod;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Work Period:", left, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${wp.cashier} • Started: ${fmtDateTime(wp.startedAt)}`, left + 70, y);
    y += 12;
    if (wp.isClosed && wp.endedAt) {
      doc.text(`Closed: ${fmtDateTime(wp.endedAt)}`, left + 70, y);
      const duration = fmtDuration(wp.endedAt - wp.startedAt);
      doc.text(`Duration: ${duration}`, left + 250, y);
    } else {
      doc.setTextColor(0, 128, 0);
      doc.text("Status: Active", left + 70, y);
      const duration = fmtDuration(Date.now() - wp.startedAt);
      doc.setTextColor(0);
      doc.text(`Duration: ${duration}`, left + 200, y);
    }
    y += 16;
  }
  y += 8;


  const boxData: { label: string; value: string; color?: [number, number, number] }[] = [
    { label: "Total Sales", value: formatIntMoney(overallSales) },
    ...(salesDashboardEnabled ? [{ label: "Take Away Sales", value: formatIntMoney(takeawayTotal) }] : []),
    ...(deliveryEnabled ? [{ label: "Delivery Sales", value: formatIntMoney(deliveryTotal) }] : []),
    ...(tableEnabled ? [{ label: "Table Sales", value: formatIntMoney(tableSalesTotal) }] : []),
    { label: "Credit Sales", value: formatIntMoney(totalCreditSales) },
    ...(showExport ? [{ label: "Export Advance", value: formatIntMoney(exportAdvanceTotal) }] : []),
    ...(showAdvBooking ? [{ label: "Advance/Booking", value: formatIntMoney(advBookingTotal) }] : []),
    { label: "Total Cancelled", value: formatIntMoney(totalCancelledAmount), color: [0, 0, 0] as [number, number, number] },
    { label: "Total Discount", value: formatIntMoney(overallDiscount), color: [0, 0, 0] as [number, number, number] },
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
  if (salesDashboardEnabled) {
    heading("Takeaway Sales");
    row("Takeaway Sales Total", formatIntMoney(takeawayTotal), true);
    row("Discounts", formatIntMoney(takeawayDiscount));
    if (takeawayCancelled.length > 0) {
      row(`Cancelled Orders (${takeawayCancelled.length})`, formatIntMoney(takeawayCancelledTotal), false, [200, 0, 0]);
    }
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
      const name = waitersById[wid]?.name ?? args.tableOrders.find(o => o.waiterId === wid)?.waiterName ?? wid;
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
    row("Export Gross Total", formatIntMoney(exportGrossTotal));
    if (exportDiscount > 0) row("Export Discount", formatIntMoney(exportDiscount));
    row("Advance Payments Received", formatIntMoney(exportAdvanceTotal), true);
    row("Remaining Balance", formatIntMoney(exportRemainingTotal));
    if (exportCancelled.length > 0) {
      row(`Cancelled (${exportCancelled.length})`, formatIntMoney(exportCancelledTotal), false, [200, 0, 0]);
    }

    // By customer — show advance and remaining
    const byExpCust: Record<string, { advance: number; remaining: number; discount: number; grossTotal: number; count: number }> = {};
    for (const s of exportCompleted) {
      if (!byExpCust[s.customerId]) byExpCust[s.customerId] = { advance: 0, remaining: 0, discount: 0, grossTotal: 0, count: 0 };
      byExpCust[s.customerId].advance += (s.advancePayment ?? 0);
      byExpCust[s.customerId].discount += (s.discountAmount ?? 0);
      byExpCust[s.customerId].grossTotal += s.total;
      byExpCust[s.customerId].count += 1;
    }
    y += 4;
    for (const [cid, data] of Object.entries(byExpCust).sort((a, b) =>
      (exportCustomersById[a[0]]?.name ?? "").localeCompare(exportCustomersById[b[0]]?.name ?? "")
    )) {
      const name = exportCustomersById[cid]?.name ?? cid;
      const rem = data.grossTotal - data.discount - data.advance;
      row(`${name} — Advance`, formatIntMoney(data.advance), true);
      row(`${name} — Remaining`, formatIntMoney(rem));
    }
  }

  // ===== ADVANCE/BOOKING =====
  if (showAdvBooking && (advCompleted.length > 0 || bkCompleted.length > 0)) {
    heading("Advance / Booking Orders");
    if (advCompleted.length > 0 || advCancelled.length > 0) {
      row("Advance Item Sales", formatIntMoney(advTotal), true);
      row("Advance Payments Received", formatIntMoney(advAdvanceTotal));
      if (advDiscount > 0) row("Advance Discount", formatIntMoney(advDiscount));
      if (advCancelled.length > 0) row(`Cancelled (${advCancelled.length})`, formatIntMoney(advCancelledTotal), false, [200, 0, 0]);
    }
    if (bkCompleted.length > 0 || bkCancelled.length > 0) {
      y += 4;
      row("Time-Based Bookings", formatIntMoney(bkTotal), true);
      const bkTotalHours = bkCompleted.reduce((s, o) => s + o.durationHours, 0);
      row("Total Hours Booked", `${bkTotalHours}h`);
      row("Booking Advance Received", formatIntMoney(bkAdvanceTotal));
      if (bkDiscount > 0) row("Booking Discount", formatIntMoney(bkDiscount));
      if (bkCancelled.length > 0) row(`Cancelled (${bkCancelled.length})`, formatIntMoney(bkCancelledTotal), false, [200, 0, 0]);

      // Revenue by bookable item
      const byBookItem: Record<string, { name: string; count: number; hours: number; revenue: number }> = {};
      for (const o of bkCompleted) {
        if (!byBookItem[o.bookableItemId]) byBookItem[o.bookableItemId] = { name: o.bookableItemName, count: 0, hours: 0, revenue: 0 };
        byBookItem[o.bookableItemId].count += 1;
        byBookItem[o.bookableItemId].hours += o.durationHours;
        byBookItem[o.bookableItemId].revenue += o.advancePayment;
      }
      const bookItemBreakdown = Object.values(byBookItem).sort((a, b) => b.revenue - a.revenue);
      if (bookItemBreakdown.length > 0) {
        y += 6;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Revenue by Bookable Item", left, y);
        y += 14;
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
        doc.text("Item", left + 4, y);
        doc.text("Bookings", left + contentWidth * 0.4, y);
        doc.text("Hours", left + contentWidth * 0.55, y);
        doc.text("Revenue", left + contentWidth * 0.75, y);
        y += 10;
        separator();
        doc.setFont("helvetica", "normal"); doc.setTextColor(0);
        for (const r of bookItemBreakdown) {
          checkPage();
          doc.setFontSize(9);
          doc.text(r.name.slice(0, 30), left + 4, y);
          doc.text(String(r.count), left + contentWidth * 0.4, y);
          doc.text(`${r.hours}h`, left + contentWidth * 0.55, y);
          doc.text(formatIntMoney(r.revenue), left + contentWidth * 0.75, y);
          y += lineH;
        }
      }
    }
  }

  // ===== OVERALL SUMMARY =====
  heading("Overall Summary");
  separator();
  if (salesDashboardEnabled) row("Takeaway Sales", formatIntMoney(takeawayTotal));
  if (deliveryEnabled) row("Delivery Sales", formatIntMoney(deliveryTotal));
  if (tableEnabled) row("Table Sales", formatIntMoney(tableSalesTotal));
  row("Credit Sales", formatIntMoney(totalCreditSales));
  if (showExport) row("Export Advance", formatIntMoney(exportAdvanceTotal));
  if (showAdvBooking) row("Advance/Booking", formatIntMoney(advBookingTotal));
  y += 4;
  row("Overall Sales", formatIntMoney(overallSales), true);
  row("Total Discount", formatIntMoney(overallDiscount));
  // Tax & Service charge totals
  const taxEnabled = args.settings?.taxEnabled ?? false;
  const serviceChargeEnabled = args.settings?.serviceChargeEnabled ?? false;
  const totalTaxAmount = completed.reduce((s, o) => s + (o.taxAmount ?? 0), 0) + completedTableOrders.reduce((s, o) => s + (o.taxAmount ?? 0), 0);
  const totalServiceAmount = completed.reduce((s, o) => s + (o.serviceChargeAmount ?? 0), 0) + completedTableOrders.reduce((s, o) => s + (o.serviceChargeAmount ?? 0), 0);
  if (taxEnabled && totalTaxAmount > 0) row(`Total ${args.settings?.taxLabel || "Tax"}`, formatIntMoney(totalTaxAmount));
  if (serviceChargeEnabled && totalServiceAmount > 0) row(`Total ${args.settings?.serviceChargeLabel || "Service Charge"}`, formatIntMoney(totalServiceAmount));
  row("Total Cancelled", formatIntMoney(totalCancelledAmount));
  row("Minus Expenses", `-${formatIntMoney(totalExpenses)}`, false, [200, 0, 0]);
  y += 4;
  separator();
  row("= Remaining Balance", formatIntMoney(overallSales - totalExpenses), true);

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
      doc.text(fmtDate(e.createdAt), right - 10, y, { align: "right" });
      y += lineH;
    });
  }

  // ===== ITEMS SALES =====
  const byItem: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
  const addLines = (list: Array<{ lines: Array<{ itemId: string; name: string; qty: number; unitPrice: number; subtotal: number; buyingPrice?: number }> }>) => {
    for (const o of list) {
      for (const l of o.lines) {
        const isAddOn = l.itemId.includes("__ao_");
        const item = itemsById[l.itemId];
        const buying = l.buyingPrice ?? item?.buyingPrice ?? 0;
        const hasBuying = !isAddOn && (l.buyingPrice != null || item?.buyingPrice != null);
        if (!byItem[l.itemId]) byItem[l.itemId] = { name: l.name, qty: 0, revenue: 0, profit: 0 };
        byItem[l.itemId].qty += l.qty;
        byItem[l.itemId].revenue += l.subtotal;
        if (hasBuying) byItem[l.itemId].profit += (l.unitPrice - buying) * l.qty;
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

  // ===== CATEGORY SALES BREAKDOWN =====
  {
    const byCat: Record<string, { catId: string; name: string; section?: string; qty: number; revenue: number; profit: number }> = {};
    const addCatLines = (list: Array<{ lines: Array<{ itemId: string; name: string; qty: number; unitPrice: number; subtotal: number; buyingPrice?: number }> }>) => {
      for (const o of list) {
        for (const l of o.lines) {
          const isAddOn = l.itemId.includes("__ao_");
          const item = itemsById[l.itemId];
          const catId = item?.categoryId ?? "uncategorized";
          const cat = categoriesById[catId];
          const catName = cat?.name ?? "Uncategorized";
          const section = cat?.printerSection;
          const buying = l.buyingPrice ?? item?.buyingPrice ?? 0;
          const hasBuying = !isAddOn && (l.buyingPrice != null || item?.buyingPrice != null);
          if (!byCat[catId]) byCat[catId] = { catId, name: catName, section, qty: 0, revenue: 0, profit: 0 };
          byCat[catId].qty += l.qty;
          byCat[catId].revenue += l.subtotal;
          if (hasBuying) byCat[catId].profit += (l.unitPrice - buying) * l.qty;
        }
      }
    };
    addCatLines(completed);
    addCatLines(completedTableOrders);
    const catSales = Object.values(byCat).sort((a, b) => b.revenue - a.revenue);

    if (catSales.length > 0) {
      const printCatHeader = () => {
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
        doc.text("Category", left + 4, y);
        doc.text("Qty", left + contentWidth * 0.45, y);
        doc.text("Sales", left + contentWidth * 0.6, y);
        doc.text("Profit", left + contentWidth * 0.8, y);
        y += 10;
        separator();
        doc.setFont("helvetica", "normal"); doc.setTextColor(0);
      };

      heading("Sales by Category");
      printCatHeader();

      for (const r of catSales) {
        if (y + lineH * 2 > pageHeight) { doc.addPage(); y = 48; printCatHeader(); }
        doc.setFontSize(9);
        doc.text(r.name.slice(0, 35), left + 4, y);
        doc.text(String(r.qty), left + contentWidth * 0.45, y);
        doc.text(formatIntMoney(r.revenue), left + contentWidth * 0.6, y);
        doc.text(formatIntMoney(r.profit), left + contentWidth * 0.8, y);
        y += lineH;
      }
      // Total
      const totalCatRev = catSales.reduce((s, r) => s + r.revenue, 0);
      const totalCatProfit = catSales.reduce((s, r) => s + r.profit, 0);
      const totalCatQty = catSales.reduce((s, r) => s + r.qty, 0);
      y += 4; separator();
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text("Total", left + 4, y);
      doc.text(String(totalCatQty), left + contentWidth * 0.45, y);
      doc.text(formatIntMoney(totalCatRev), left + contentWidth * 0.6, y);
      doc.text(formatIntMoney(totalCatProfit), left + contentWidth * 0.8, y);
      y += lineH;

      // ===== SECTION BREAKDOWN =====
      const sectionsUsed = catSales.filter(c => c.section);
      if (sectionsUsed.length > 0) {
        const bySection: Record<string, { section: string; qty: number; revenue: number; profit: number }> = {};
        for (const c of catSales) {
          const sec = c.section || "No Section";
          if (!bySection[sec]) bySection[sec] = { section: sec, qty: 0, revenue: 0, profit: 0 };
          bySection[sec].qty += c.qty;
          bySection[sec].revenue += c.revenue;
          bySection[sec].profit += c.profit;
        }
        const sectionSales = Object.values(bySection).sort((a, b) => b.revenue - a.revenue);

        heading("Sales by Section");
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
        doc.text("Section", left + 4, y);
        doc.text("Qty", left + contentWidth * 0.45, y);
        doc.text("Sales", left + contentWidth * 0.6, y);
        doc.text("Profit", left + contentWidth * 0.8, y);
        y += 10; separator();
        doc.setFont("helvetica", "normal"); doc.setTextColor(0);

        for (const r of sectionSales) {
          checkPage();
          doc.setFontSize(9);
          doc.text(r.section, left + 4, y);
          doc.text(String(r.qty), left + contentWidth * 0.45, y);
          doc.text(formatIntMoney(r.revenue), left + contentWidth * 0.6, y);
          doc.text(formatIntMoney(r.profit), left + contentWidth * 0.8, y);
          y += lineH;
        }
        const totalSecRev = sectionSales.reduce((s, r) => s + r.revenue, 0);
        const totalSecProfit = sectionSales.reduce((s, r) => s + r.profit, 0);
        const totalSecQty = sectionSales.reduce((s, r) => s + r.qty, 0);
        y += 4; separator();
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
        doc.text("Total", left + 4, y);
        doc.text(String(totalSecQty), left + contentWidth * 0.45, y);
        doc.text(formatIntMoney(totalSecRev), left + contentWidth * 0.6, y);
        doc.text(formatIntMoney(totalSecProfit), left + contentWidth * 0.8, y);
        y += lineH;
      }
    }
  }

  return doc;
}

export function AdminReports() {
  const { session } = useAuth();
  const { toast } = useToast();
  const isAdmin = session?.role === "admin";
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
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
    advanceOrders: AdvanceOrder[];
    bookingOrders: BookingOrder[];
  }>({
    loading: false,
    orders: [],
    expenses: [],
    tableOrders: [],
    exportSales: [],
    advanceOrders: [],
    bookingOrders: [],
  });


  React.useEffect(() => {
    (async () => {
      const [s, cats, cs, dps, its, wps, tbls, wtrs, expCs] = await Promise.all([
        db.settings.get("app"),
        db.categories.orderBy("createdAt").toArray(),
        db.customers.orderBy("createdAt").toArray(),
        db.deliveryPersons.orderBy("createdAt").toArray(),
        db.items.orderBy("createdAt").toArray(),
        db.workPeriods.orderBy("startedAt").reverse().toArray().then((wps) => {
          // Non-admin: limit to last 7 days of work periods
          if (!isAdmin) {
            const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            return wps.filter((wp) => wp.startedAt >= oneWeekAgo);
          }
          return wps;
        }),
        db.restaurantTables.orderBy("createdAt").toArray(),
        db.waiters.orderBy("createdAt").toArray(),
        db.exportCustomers.orderBy("createdAt").toArray(),
      ]);
      setSettings(s ?? null);
      setCategories(cats);
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
    const wp = workPeriods.find((w) => w.id === workPeriodId);
    const all = await db.tableOrders.toArray();
    return all.filter((o) => {
      if (o.workPeriodId === workPeriodId) return true;
      // Fallback: include cancelled orders within work period time range that have no workPeriodId
      if (!o.workPeriodId && o.status === "cancelled" && wp) {
        const wpEnd = wp.endedAt ?? Date.now();
        return o.createdAt >= wp.startedAt && o.createdAt <= wpEnd;
      }
      return false;
    });
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

  const fetchAdvanceOrdersInRange = async (fromTs: number, toTs: number) => {
    const all = await db.advanceOrders.toArray();
    return all.filter((o) => o.createdAt >= fromTs && o.createdAt <= toTs);
  };

  const fetchBookingOrdersInRange = async (fromTs: number, toTs: number) => {
    const all = await db.bookingOrders.toArray();
    return all.filter((o) => o.createdAt >= fromTs && o.createdAt <= toTs);
  };

  const loadSalesPreview = async () => {
    try {
      setSalesPreview((p) => ({ ...p, loading: true }));
      
      let orders: Order[];
      let expenses: Expense[];
      let tableOrders: TableOrder[];
      let expSales: ExportSale[];
      let fromTs: number;
      let toTs: number;
      if (filterType === "workPeriod" && selectedWorkPeriodId) {
        orders = await fetchOrdersByWorkPeriod(selectedWorkPeriodId);
        expenses = await fetchExpensesByWorkPeriod(selectedWorkPeriodId);
        tableOrders = await fetchTableOrdersByWorkPeriod(selectedWorkPeriodId);
        const wp = workPeriods.find((w) => w.id === selectedWorkPeriodId);
        fromTs = wp?.startedAt ?? Date.now();
        toTs = wp?.endedAt ?? Date.now();
        expSales = wp ? await fetchExportSalesInRange(fromTs, toTs) : [];
      } else {
        fromTs = startOfDay(parseDateInput(from));
        toTs = endOfDay(parseDateInput(to));
        orders = await fetchOrdersInRange(fromTs, toTs);
        expenses = await fetchExpensesInRange(fromTs, toTs);
        tableOrders = await fetchTableOrdersInRange(fromTs, toTs);
        expSales = await fetchExportSalesInRange(fromTs, toTs);
      }

      const advOrders = await fetchAdvanceOrdersInRange(fromTs, toTs);
      const bkOrders = await fetchBookingOrdersInRange(fromTs, toTs);
      
      setSalesPreview({ loading: false, orders, expenses, tableOrders, exportSales: expSales, advanceOrders: advOrders, bookingOrders: bkOrders });
    } catch (e: any) {
      setSalesPreview((p) => ({ ...p, loading: false }));
      toast({ title: "Preview failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const buildSalesBytes = async () => {
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
    const advOrders = await fetchAdvanceOrdersInRange(fromTs, toTs);
    const bkOrders = await fetchBookingOrdersInRange(fromTs, toTs);

    const doc = buildSalesPdf({
      restaurantName: settings?.restaurantName ?? "SANGI POS",
      from: fromTs,
      to: toTs,
      orders,
      categories,
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
      advanceOrders: advOrders,
      bookingOrders: bkOrders,
    });
    const bytes = doc.output("arraybuffer");
    const fileName = `sales_${toDateInputValue(fromTs)}_${toDateInputValue(toTs)}.pdf`;
    return { bytes: new Uint8Array(bytes), fileName };
  };

  const saveSales = async (overrideName?: string) => {
    try {
      const { bytes, fileName } = await buildSalesBytes();
      await savePdfBytes(bytes, overrideName ?? fileName);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const exportSales = async () => {
    try {
      const { bytes, fileName } = await buildSalesBytes();
      await sharePdfBytes(bytes, fileName, "Sales Report");
      toast({ title: "Sales report exported", description: fileName });
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
                      {wp.cashier} • {fmtDateTime(wp.startedAt)}
                      {wp.endedAt ? ` → ${fmtTime12(new Date(wp.endedAt).toTimeString().slice(0,5))}` : " (active)"}
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
        categories={categories}
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
        advanceOrders={salesPreview.advanceOrders}
        bookingOrders={salesPreview.bookingOrders}
      />

      <Card>
        <CardHeader>
          <CardTitle>PDF Export</CardTitle>
          <CardDescription>Export the sales report as PDF — matches the app view above (summary, credit customers, items sales).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <SaveShareMenu label="Sales PDF" getDefaultFileName={() => `sales_${from}_${to}.pdf`} onSave={(fn) => void saveSales(fn)} onShare={() => void exportSales()} />
        </CardContent>
      </Card>
    </div>
  );
}
