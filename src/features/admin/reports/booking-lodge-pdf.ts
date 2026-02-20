import jsPDF from "jspdf";
import type { BookingOrder } from "@/db/booking-schema";
import { formatIntMoney, fmtDate } from "@/features/pos/format";

export function buildBookingLodgePdf(args: {
  restaurantName: string;
  fromLabel: string;
  toLabel: string;
  bookingOrders: BookingOrder[];
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
    if (y + needed > pageHeight) { doc.addPage(); y = 48; }
  };

  const completed = args.bookingOrders.filter((o) => o.status !== "cancelled");
  const cancelled = args.bookingOrders.filter((o) => o.status === "cancelled");
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const totalAdvance = completed.reduce((s, o) => s + o.advancePayment, 0);
  const totalRemaining = completed.reduce((s, o) => s + o.remainingPayment, 0);
  const totalHours = completed.reduce((s, o) => s + o.durationHours, 0);
  const totalDiscount = completed.reduce((s, o) => s + o.discountAmount, 0);

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Booking Lodge Report", left, y);
  y += 20;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${args.restaurantName} • ${args.fromLabel} → ${args.toLabel}`, left, y);
  y += 20;

  // Summary boxes
  const summaryItems = [
    { label: "Total Bookings", value: String(completed.length) },
    { label: "Total Hours", value: `${totalHours}h` },
    { label: "Total Revenue", value: formatIntMoney(totalRevenue) },
    { label: "Advance Received", value: formatIntMoney(totalAdvance) },
    { label: "Remaining Due", value: formatIntMoney(totalRemaining) },
  ];

  const cols = 5;
  const cellW = contentWidth / cols;
  const cellH = 36;

  for (let i = 0; i < summaryItems.length; i++) {
    const col = i % cols;
    const x = left + col * cellW;
    checkPage(cellH);
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.roundedRect(x + 2, y, cellW - 4, cellH - 4, 3, 3);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(summaryItems[i].label, x + 6, y + 12);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    if (summaryItems[i].label === "Remaining Due") {
      doc.setTextColor(totalRemaining > 0 ? 200 : 0, totalRemaining > 0 ? 50 : 150, totalRemaining > 0 ? 50 : 50);
    } else {
      doc.setTextColor(0);
    }
    doc.text(summaryItems[i].value, x + 6, y + 26);
    doc.setTextColor(0);
  }
  y += cellH + 12;

  if (totalDiscount > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Total Discount: ${formatIntMoney(totalDiscount)}`, left, y);
    y += 14;
  }
  if (cancelled.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 0, 0);
    doc.text(`Cancelled: ${cancelled.length} bookings (${formatIntMoney(cancelled.reduce((s, o) => s + o.total, 0))})`, left, y);
    doc.setTextColor(0);
    y += 14;
  }

  // Revenue by bookable item
  const byItem: Record<string, { name: string; count: number; hours: number; revenue: number; advance: number }> = {};
  for (const o of completed) {
    if (!byItem[o.bookableItemId]) byItem[o.bookableItemId] = { name: o.bookableItemName, count: 0, hours: 0, revenue: 0, advance: 0 };
    byItem[o.bookableItemId].count += 1;
    byItem[o.bookableItemId].hours += o.durationHours;
    byItem[o.bookableItemId].revenue += o.total;
    byItem[o.bookableItemId].advance += o.advancePayment;
  }
  const itemBreakdown = Object.values(byItem).sort((a, b) => b.revenue - a.revenue);

  if (itemBreakdown.length > 0) {
    y += 4;
    checkPage(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Revenue by Item", left, y);
    y += 16;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("Item", left + 4, y);
    doc.text("Bookings", left + contentWidth * 0.35, y);
    doc.text("Hours", left + contentWidth * 0.5, y);
    doc.text("Revenue", left + contentWidth * 0.65, y);
    doc.text("Advance", left + contentWidth * 0.82, y);
    y += 10;
    doc.setDrawColor(200);
    doc.line(left, y - 4, right, y - 4);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    for (const r of itemBreakdown) {
      checkPage();
      doc.setFontSize(9);
      doc.text(r.name.slice(0, 25), left + 4, y);
      doc.text(String(r.count), left + contentWidth * 0.35, y);
      doc.text(`${r.hours}h`, left + contentWidth * 0.5, y);
      doc.text(formatIntMoney(r.revenue), left + contentWidth * 0.65, y);
      doc.text(formatIntMoney(r.advance), left + contentWidth * 0.82, y);
      y += lineH;
    }
    y += 8;
  }

  // Detailed booking list
  if (args.bookingOrders.length > 0) {
    checkPage(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Booking Details", left, y);
    y += 16;

    const sorted = [...args.bookingOrders].sort((a, b) => a.date - b.date || a.startTime.localeCompare(b.startTime));
    for (const o of sorted) {
      const neededH = 60 + (o.customerName ? 12 : 0);
      checkPage(neededH);

      const isCancelled = o.status === "cancelled";
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(isCancelled ? 180 : 0);
      doc.text(`${o.label === "Appointment" ? "Apt" : "Bkg"} #${o.receiptNo} — ${o.bookableItemName}${isCancelled ? " [CANCELLED]" : ""}`, left, y);
      y += 12;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(isCancelled ? 150 : 60);
      doc.text(`Date: ${fmtDate(o.date)}  |  Time: ${o.startTime} → ${o.endTime} (${o.durationHours}h)`, left + 8, y);
      y += 11;
      doc.text(`Price: ${formatIntMoney(o.price)}  |  Discount: ${formatIntMoney(o.discountAmount)}  |  Total: ${formatIntMoney(o.total)}`, left + 8, y);
      y += 11;
      doc.text(`Advance: ${formatIntMoney(o.advancePayment)}  |  Remaining: ${formatIntMoney(o.remainingPayment)}  |  Status: ${o.status}`, left + 8, y);
      y += 11;

      if (o.customerName || o.customerPhone || o.customerAddress) {
        const parts = [o.customerName, o.customerPhone, o.customerAddress].filter(Boolean).join("  |  ");
        doc.text(`Customer: ${parts}`, left + 8, y);
        y += 11;
      }
      if (o.cancelledReason) {
        doc.setTextColor(200, 0, 0);
        doc.text(`Reason: ${o.cancelledReason}`, left + 8, y);
        doc.setTextColor(0);
        y += 11;
      }

      doc.setDrawColor(230);
      doc.line(left, y, right, y);
      y += 6;
    }
  }

  return doc;
}
