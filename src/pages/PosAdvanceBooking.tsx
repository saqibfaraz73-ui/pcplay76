import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/db/appDb";
import type { MenuItem, Settings } from "@/db/schema";
import type { AdvanceOrder, AdvanceOrderLine, BookableItem, BookingOrder } from "@/db/booking-schema";
import { useAuth } from "@/auth/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { formatIntMoney, fmtDate, fmtDateTime, fmtTime12 } from "@/features/pos/format";
import { makeId } from "@/features/admin/id";
import { printAdvanceReceipt, printAdvanceKot, printBookingReceipt, printBookingKot } from "@/features/pos/advance-receipt";
import { buildBookingLodgePdf } from "@/features/admin/reports/booking-lodge-pdf";
import { buildAdvanceLodgePdf } from "@/features/admin/reports/advance-lodge-pdf";
import { writePdfFile, shareFile } from "@/features/files/sangi-folders";
import { Capacitor } from "@capacitor/core";
import { Plus, Trash2, X, Check, Ban, Printer, FileText, Share2, Wrench } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

/* ─── helpers ─── */

type DurationUnit = "minutes" | "hours" | "days";

function calcEndTime(start: string, duration: number, unit: DurationUnit = "hours"): string {
  const [h, m] = start.split(":").map(Number);
  let totalMin: number;
  switch (unit) {
    case "minutes": totalMin = h * 60 + m + duration; break;
    case "days":    totalMin = h * 60 + m + duration * 24 * 60; break;
    default:        totalMin = h * 60 + m + Math.round(duration * 60); break;
  }
  const eh = Math.floor(totalMin / 60) % 24;
  const em = totalMin % 60;
  const period = eh >= 12 ? "PM" : "AM";
  const h12 = eh === 0 ? 12 : eh > 12 ? eh - 12 : eh;
  return `${h12}:${String(em).padStart(2, "0")} ${period}`;
}

function durationToHours(duration: number, unit: DurationUnit): number {
  switch (unit) {
    case "minutes": return duration / 60;
    case "days":    return duration * 24;
    default:        return duration;
  }
}

function formatDuration(duration: number, unit: DurationUnit): string {
  switch (unit) {
    case "minutes": return `${duration}min`;
    case "days":    return `${duration}d`;
    default:        return `${duration}h`;
  }
}

function toDateInputValue(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getNextCounter(id: "advanceOrder" | "bookingOrder"): Promise<number> {
  return await db.transaction("rw", db.counters, async () => {
    const row = await db.counters.get(id);
    const next = row?.next ?? 1;
    await db.counters.put({ id, next: next + 1 });
    return next;
  });
}

/* ─── Advance Lodge Sub-component ─── */
function AdvanceLodgeSection({ advanceOrders, settings }: { advanceOrders: AdvanceOrder[]; settings: Settings | null }) {
  const { toast } = useToast();
  const now = Date.now();
  const [lodgeFrom, setLodgeFrom] = React.useState(toDateInputValue(now));
  const [lodgeTo, setLodgeTo] = React.useState(toDateInputValue(now));

  const filteredOrders = React.useMemo(() => {
    const fromTs = new Date(lodgeFrom).setHours(0, 0, 0, 0);
    const toTs = new Date(lodgeTo).setHours(23, 59, 59, 999);
    return advanceOrders.filter((o) => o.createdAt >= fromTs && o.createdAt <= toTs);
  }, [advanceOrders, lodgeFrom, lodgeTo]);

  const completed = filteredOrders.filter((o) => o.status !== "cancelled");
  const pending = filteredOrders.filter((o) => o.status === "pending");
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const totalAdvance = completed.reduce((s, o) => s + o.advancePayment, 0);
  const totalRemaining = completed.reduce((s, o) => s + o.remainingPayment, 0);

  const sharePdf = async () => {
    try {
      const restaurantName = settings?.restaurantName || "SANGI POS";
      const doc = buildAdvanceLodgePdf({
        restaurantName,
        fromLabel: lodgeFrom,
        toLabel: lodgeTo,
        advanceOrders: filteredOrders,
      });
      const bytes = doc.output("arraybuffer");
      const fileName = `advance_lodge_${lodgeFrom}_${lodgeTo}.pdf`;

      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: "Advance Orders Lodge", uri: saved.uri });
      } else {
        doc.save(fileName);
        toast({ title: "PDF downloaded" });
      }
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Advance Orders Lodge</CardTitle>
        <CardDescription>View all advance orders by date range and share as PDF.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={lodgeFrom} onChange={(e) => setLodgeFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={lodgeTo} onChange={(e) => setLodgeTo(e.target.value)} />
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1 w-full sm:w-auto" onClick={() => void sharePdf()}>
            <Share2 className="h-3.5 w-3.5" /> Share PDF
          </Button>
        </div>

        {filteredOrders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Orders</div>
              <div className="font-semibold">{completed.length}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Pending</div>
              <div className="font-semibold">{pending.length}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Revenue</div>
              <div className="font-semibold">{formatIntMoney(totalRevenue)}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Remaining</div>
              <div className="font-semibold">{formatIntMoney(totalRemaining)}</div>
            </div>
          </div>
        )}
        {filteredOrders.length === 0 && <p className="text-xs text-muted-foreground">No advance orders in selected range.</p>}
      </CardContent>
    </Card>
  );
}

/* ─── Booking Lodge Sub-component ─── */
function BookingLodgeSection({ bookingOrders, settings }: { bookingOrders: BookingOrder[]; settings: Settings | null }) {
  const { toast } = useToast();
  const now = Date.now();
  const [lodgeFrom, setLodgeFrom] = React.useState(toDateInputValue(now));
  const [lodgeTo, setLodgeTo] = React.useState(toDateInputValue(now));

  const filteredBookings = React.useMemo(() => {
    const fromTs = new Date(lodgeFrom).setHours(0, 0, 0, 0);
    const toTs = new Date(lodgeTo).setHours(23, 59, 59, 999);
    return bookingOrders.filter((o) => o.createdAt >= fromTs && o.createdAt <= toTs);
  }, [bookingOrders, lodgeFrom, lodgeTo]);

  const completed = filteredBookings.filter((o) => o.status !== "cancelled" && !o.isMaintenance);
  const totalHours = completed.reduce((s, o) => s + o.durationHours, 0);
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);

  // Group by bookable item
  const byItem = React.useMemo(() => {
    const map: Record<string, { name: string; count: number; hours: number; revenue: number }> = {};
    for (const o of completed) {
      if (!map[o.bookableItemId]) map[o.bookableItemId] = { name: o.bookableItemName, count: 0, hours: 0, revenue: 0 };
      map[o.bookableItemId].count += 1;
      map[o.bookableItemId].hours += o.durationHours;
      map[o.bookableItemId].revenue += o.total;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [completed]);

  const sharePdf = async () => {
    try {
      const restaurantName = settings?.restaurantName || "SANGI POS";
      const doc = buildBookingLodgePdf({
        restaurantName,
        fromLabel: lodgeFrom,
        toLabel: lodgeTo,
        bookingOrders: filteredBookings,
      });
      const bytes = doc.output("arraybuffer");
      const fileName = `booking_lodge_${lodgeFrom}_${lodgeTo}.pdf`;

      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: "Booking Lodge Report", uri: saved.uri });
      } else {
        doc.save(fileName);
        toast({ title: "PDF downloaded" });
      }
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Booking Lodge</CardTitle>
        <CardDescription>View booking summary by date range and share as PDF.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={lodgeFrom} onChange={(e) => setLodgeFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={lodgeTo} onChange={(e) => setLodgeTo(e.target.value)} />
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1 w-full sm:w-auto" onClick={() => void sharePdf()}>
            <Share2 className="h-3.5 w-3.5" /> Share PDF
          </Button>
        </div>

        {filteredBookings.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Bookings</div>
                <div className="font-semibold">{completed.length}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Total Hours</div>
                <div className="font-semibold">{totalHours}h</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Total Revenue</div>
                <div className="font-semibold">{formatIntMoney(totalRevenue)}</div>
              </div>
            </div>

            {byItem.length > 0 && (
              <div className="overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr><th className="px-3 py-1.5 text-left font-medium">Item</th><th className="px-3 py-1.5 text-left font-medium">Bookings</th><th className="px-3 py-1.5 text-left font-medium">Hours</th><th className="px-3 py-1.5 text-left font-medium">Revenue</th></tr>
                  </thead>
                  <tbody>
                    {byItem.map((r) => (
                      <tr key={r.name} className="border-t">
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5">{r.count}</td>
                        <td className="px-3 py-1.5">{r.hours}h</td>
                        <td className="px-3 py-1.5">{formatIntMoney(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {filteredBookings.length === 0 && <p className="text-xs text-muted-foreground">No bookings in selected range.</p>}
      </CardContent>
    </Card>
  );
}

export default function PosAdvanceBooking() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [menuItems, setMenuItems] = React.useState<MenuItem[]>([]);
  const [advanceOrders, setAdvanceOrders] = React.useState<AdvanceOrder[]>([]);
  const [bookableItems, setBookableItems] = React.useState<BookableItem[]>([]);
  const [bookingOrders, setBookingOrders] = React.useState<BookingOrder[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);

  const refresh = React.useCallback(async () => {
    const [items, aOrders, bItems, bOrders, s] = await Promise.all([
      db.items.orderBy("name").toArray(),
      db.advanceOrders.orderBy("createdAt").reverse().toArray(),
      db.bookableItems.orderBy("name").toArray(),
      db.bookingOrders.orderBy("createdAt").reverse().toArray(),
      db.settings.get("app"),
    ]);
    setMenuItems(items);
    setAdvanceOrders(aOrders);
    setBookableItems(bItems);
    setBookingOrders(bOrders);
    setSettings(s ?? null);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  /* ─── Advance Item Sale Dialog ─── */
  const [advDlg, setAdvDlg] = React.useState(false);
  const [advLines, setAdvLines] = React.useState<(AdvanceOrderLine & { key: string })[]>([]);
  const [advManualTotal, setAdvManualTotal] = React.useState<string>("");
  const [advDiscount, setAdvDiscount] = React.useState("");
  const [advAdvance, setAdvAdvance] = React.useState("");
  const [advCustName, setAdvCustName] = React.useState("");
  const [advCustPhone, setAdvCustPhone] = React.useState("");
  const [advCustAddress, setAdvCustAddress] = React.useState("");
  const [advDeliveryDate, setAdvDeliveryDate] = React.useState("");
  const [advDeliveryTime, setAdvDeliveryTime] = React.useState("");

  const openAdvDlg = () => {
    setAdvLines([{ key: "1", name: "", qty: 0, unitPrice: 0, subtotal: 0, unit: "pcs" }]);
    setAdvManualTotal("");
    setAdvDiscount("");
    setAdvAdvance("");
    setAdvCustName("");
    setAdvCustPhone("");
    setAdvCustAddress("");
    setAdvDeliveryDate("");
    setAdvDeliveryTime("");
    setAdvDlg(true);
  };

  const updateAdvLine = (key: string, patch: Partial<AdvanceOrderLine>) => {
    setAdvLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // Only compute subtotal if both qty and unitPrice are set
        if (next.qty && next.unitPrice) {
          next.subtotal = Math.round(next.unitPrice) * next.qty;
        } else if (!next.qty && !next.unitPrice) {
          next.subtotal = 0;
        }
        return next;
      }),
    );
  };

  const advCalcTotal = advLines.reduce((s, l) => s + l.subtotal, 0);
  const advPreTotal = advManualTotal ? Number(advManualTotal) || 0 : advCalcTotal;
  const advDiscountAmt = Math.min(Math.max(0, Number(advDiscount) || 0), advPreTotal);
  const advTotal = Math.max(0, advPreTotal - advDiscountAmt);
  const advRemaining = Math.max(0, advTotal - (Number(advAdvance) || 0));

  const buildAdvanceOrder = async (): Promise<AdvanceOrder | null> => {
    if (advLines.every((l) => !l.name.trim())) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return null;
    }
    const lines = advLines.filter((l) => l.name.trim()).map(({ key, ...rest }) => rest);
    const receiptNo = await getNextCounter("advanceOrder");
    const order: AdvanceOrder = {
      id: makeId("adv"),
      receiptNo,
      status: "pending",
      lines,
      subtotal: advCalcTotal,
      discountAmount: advDiscountAmt,
      total: advTotal,
      advancePayment: Number(advAdvance) || 0,
      remainingPayment: advRemaining,
      customerName: advCustName.trim() || undefined,
      customerPhone: advCustPhone.trim() || undefined,
      customerAddress: advCustAddress.trim() || undefined,
      deliveryDate: advDeliveryDate || undefined,
      deliveryTime: advDeliveryTime || undefined,
      cashier: session?.username,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.advanceOrders.put(order);
    return order;
  };

  const saveAdvance = async () => {
    const order = await buildAdvanceOrder();
    if (!order) return;
    toast({ title: `Advance order #${order.receiptNo} saved` });
    setAdvDlg(false);
    void refresh();
  };

  const saveAndPrintAdvance = async () => {
    const order = await buildAdvanceOrder();
    if (!order) return;
    setAdvDlg(false);
    void refresh();
    try {
      await printAdvanceReceipt(order);
      toast({ title: `Order #${order.receiptNo} saved & printed` });
    } catch (e: any) {
      toast({ title: "Saved but print failed", description: e?.message, variant: "destructive" });
    }
  };

  const saveAndKotAdvance = async () => {
    const order = await buildAdvanceOrder();
    if (!order) return;
    setAdvDlg(false);
    void refresh();
    try {
      await printAdvanceKot(order);
      toast({ title: `Order #${order.receiptNo} saved & KOT printed` });
    } catch (e: any) {
      toast({ title: "Saved but KOT failed", description: e?.message, variant: "destructive" });
    }
  };

  /* ─── Time-Based Booking Dialog ─── */
  const [bookDlg, setBookDlg] = React.useState(false);
  const [bookItemId, setBookItemId] = React.useState("");
  const [bookDate, setBookDate] = React.useState(toDateInputValue(Date.now()));
  const [bookStart, setBookStart] = React.useState("09:00");
  const [bookDuration, setBookDuration] = React.useState("1");
  const [bookDurationUnit, setBookDurationUnit] = React.useState<DurationUnit>("hours");
  const [bookDiscount, setBookDiscount] = React.useState("");
  const [bookAdvance, setBookAdvance] = React.useState("");
  const [bookManualPrice, setBookManualPrice] = React.useState("");
  const [bookCustName, setBookCustName] = React.useState("");
  const [bookCustPhone, setBookCustPhone] = React.useState("");
  const [bookCustAddress, setBookCustAddress] = React.useState("");
  const [bookIsMaintenance, setBookIsMaintenance] = React.useState(false);

  const selectedBookItem = bookableItems.find((b) => b.id === bookItemId);
  const bookItemPrice = selectedBookItem?.price ?? 0;
  const bookPrice = bookManualPrice !== "" ? (Number(bookManualPrice) || 0) : bookItemPrice;
  const bookEndTime = calcEndTime(bookStart, Number(bookDuration) || 0, bookDurationUnit);
  const bookDiscountAmt = Math.min(Math.max(0, Number(bookDiscount) || 0), bookPrice);
  const bookTotal = Math.max(0, bookPrice - bookDiscountAmt);
  const bookRemaining = Math.max(0, bookTotal - (Number(bookAdvance) || 0));

  const openBookDlg = () => {
    setBookItemId(bookableItems[0]?.id ?? "");
    setBookDate(toDateInputValue(Date.now()));
    setBookStart("09:00");
    setBookDuration("1");
    setBookDurationUnit("hours");
    setBookDiscount("");
    setBookAdvance("");
    setBookManualPrice("");
    setBookCustName("");
    setBookCustPhone("");
    setBookCustAddress("");
    setBookIsMaintenance(false);
    setBookDlg(true);
  };

  // Check for overlapping bookings (cancelled ones are excluded automatically)
  const getOverlaps = () => {
    if (!bookItemId) return [];
    const dateTs = new Date(bookDate).setHours(0, 0, 0, 0);
    const dur = Number(bookDuration) || 0;
    const durHours = durationToHours(dur, bookDurationUnit);
    const [sh, sm] = bookStart.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = startMin + Math.round(durHours * 60);
    return bookingOrders.filter((o) => {
      if (o.bookableItemId !== bookItemId || o.status === "cancelled") return false;
      const oDate = new Date(o.date).setHours(0, 0, 0, 0);
      if (oDate !== dateTs) return false;
      const [oh, om] = o.startTime.split(":").map(Number);
      const oStart = oh * 60 + om;
      const oEnd = oStart + Math.round(o.durationHours * 60);
      return startMin < oEnd && endMin > oStart;
    });
  };

  const buildBookingOrder = async (): Promise<BookingOrder | null> => {
    if (!bookItemId || !selectedBookItem) {
      toast({ title: "Select a bookable item", variant: "destructive" });
      return null;
    }
    const receiptNo = await getNextCounter("bookingOrder");
    const finalPrice = bookIsMaintenance ? 0 : bookPrice;
    const finalDiscount = bookIsMaintenance ? 0 : bookDiscountAmt;
    const finalTotal = bookIsMaintenance ? 0 : bookTotal;
    const finalAdvance = bookIsMaintenance ? 0 : (Number(bookAdvance) || 0);
    const finalRemaining = bookIsMaintenance ? 0 : bookRemaining;
    const order: BookingOrder = {
      id: makeId("bkng"),
      receiptNo,
      bookableItemId: bookItemId,
      bookableItemName: selectedBookItem.name,
      status: "pending",
      date: new Date(bookDate).setHours(0, 0, 0, 0),
      startTime: bookStart,
      durationHours: durationToHours(Number(bookDuration) || 1, bookDurationUnit),
      endTime: bookEndTime,
      price: finalPrice,
      discountAmount: finalDiscount,
      total: finalTotal,
      advancePayment: finalAdvance,
      remainingPayment: finalRemaining,
      isMaintenance: bookIsMaintenance || undefined,
      customerName: bookCustName.trim() || undefined,
      customerPhone: bookCustPhone.trim() || undefined,
      customerAddress: bookCustAddress.trim() || undefined,
      cashier: session?.username,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.bookingOrders.put(order);
    return order;
  };

  const saveBooking = async () => {
    const order = await buildBookingOrder();
    if (!order) return;
    toast({ title: `Booking #${order.receiptNo} saved` });
    setBookDlg(false);
    void refresh();
  };

  const saveAndPrintBooking = async () => {
    const order = await buildBookingOrder();
    if (!order) return;
    setBookDlg(false);
    void refresh();
    try {
      await printBookingReceipt(order);
      toast({ title: `Booking #${order.receiptNo} saved & printed` });
    } catch (e: any) {
      toast({ title: "Saved but print failed", description: e?.message, variant: "destructive" });
    }
  };

  /* ─── Status changes ─── */
  const [cancelId, setCancelId] = React.useState<{ id: string; type: "advance" | "booking" } | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");

  const completeAdvance = async (id: string) => {
    const o = await db.advanceOrders.get(id);
    if (!o || o.status !== "pending") return;
    const now = Date.now();
    await db.advanceOrders.update(id, { status: "completed", updatedAt: now, createdAt: now });
    toast({ title: "Order completed" });
    void refresh();
  };

  const completeBooking = async (id: string) => {
    const o = await db.bookingOrders.get(id);
    if (!o || o.status !== "pending") return;
    // Prevent completing before the booking end time
    const [eh, em] = o.endTime.replace(/ (AM|PM)/, (_, p) => p === "PM" ? "+12" : "").split(":").map(Number);
    // Parse end time properly
    const endTimeParts = o.endTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (endTimeParts) {
      let endH = parseInt(endTimeParts[1]);
      const endM = parseInt(endTimeParts[2]);
      const period = endTimeParts[3].toUpperCase();
      if (period === "PM" && endH !== 12) endH += 12;
      if (period === "AM" && endH === 12) endH = 0;
      const bookingDate = new Date(o.date);
      const endDate = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate(), endH, endM);
      if (Date.now() < endDate.getTime()) {
        toast({ title: "Cannot complete yet", description: `Booking ends at ${o.endTime}. You can cancel it instead.`, variant: "destructive" });
        return;
      }
    }
    const now = Date.now();
    await db.bookingOrders.update(id, { status: "completed", updatedAt: now, createdAt: now });
    toast({ title: "Booking completed" });
    void refresh();
  };

  const doCancelOrder = async () => {
    if (!cancelId || !cancelReason.trim()) {
      toast({ title: "Reason is required", variant: "destructive" });
      return;
    }
    if (cancelId.type === "advance") {
      await db.advanceOrders.update(cancelId.id, { status: "cancelled", cancelledReason: cancelReason.trim(), updatedAt: Date.now() });
    } else {
      // Cancelling a booking frees up that time slot automatically
      await db.bookingOrders.update(cancelId.id, { status: "cancelled", cancelledReason: cancelReason.trim(), updatedAt: Date.now() });
    }
    toast({ title: "Cancelled" });
    setCancelId(null);
    setCancelReason("");
    void refresh();
  };

  /* ─── Reprint / Share from history ─── */
  const reprintAdvance = async (order: AdvanceOrder) => {
    try {
      await printAdvanceReceipt(order);
      toast({ title: "Reprinted" });
    } catch (e: any) {
      toast({ title: "Print failed", description: e?.message, variant: "destructive" });
    }
  };

  const shareAdvancePdf = async (order: AdvanceOrder) => {
    try {
      const s = settings;
      const restaurantName = s?.restaurantName || "SANGI POS";
      const { buildAdvanceReceiptPdf } = await import("@/features/pos/advance-receipt");
      const doc = buildAdvanceReceiptPdf(order, s);
      const bytes = doc.output("arraybuffer");
      const fileName = `advance_${order.receiptNo}_${Date.now()}.pdf`;
      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: `Advance #${order.receiptNo}`, uri: saved.uri });
      } else {
        doc.save(fileName);
        toast({ title: "PDF downloaded" });
      }
    } catch (e: any) {
      toast({ title: "Share failed", description: e?.message, variant: "destructive" });
    }
  };

  const reprintBooking = async (order: BookingOrder) => {
    try {
      await printBookingReceipt(order);
      toast({ title: "Reprinted" });
    } catch (e: any) {
      toast({ title: "Print failed", description: e?.message, variant: "destructive" });
    }
  };

  const shareBookingPdf = async (order: BookingOrder) => {
    try {
      const s = settings;
      const { buildBookingReceiptPdf } = await import("@/features/pos/advance-receipt");
      const doc = buildBookingReceiptPdf(order, s);
      const bytes = doc.output("arraybuffer");
      const fileName = `booking_${order.receiptNo}_${Date.now()}.pdf`;
      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: `Booking #${order.receiptNo}`, uri: saved.uri });
      } else {
        doc.save(fileName);
        toast({ title: "PDF downloaded" });
      }
    } catch (e: any) {
      toast({ title: "Share failed", description: e?.message, variant: "destructive" });
    }
  };

  /* ─── Bookable Items Management (admin only) ─── */
  const isAdmin = session?.role === "admin";
  const [newBIName, setNewBIName] = React.useState("");
  const [newBIPrice, setNewBIPrice] = React.useState("");

  const addBookableItem = async () => {
    if (!newBIName.trim()) return;
    const item: BookableItem = {
      id: makeId("bi"),
      name: newBIName.trim(),
      price: Number(newBIPrice) || 0,
      createdAt: Date.now(),
    };
    await db.bookableItems.put(item);
    setNewBIName("");
    setNewBIPrice("");
    toast({ title: "Bookable item added" });
    void refresh();
  };

  const deleteBookableItem = async (id: string) => {
    await db.bookableItems.delete(id);
    toast({ title: "Removed" });
    void refresh();
  };

  const statusColor = (s: string) => {
    if (s === "completed") return "default";
    if (s === "cancelled") return "destructive";
    return "secondary";
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Advance / Booking Orders</h1>
        <p className="text-sm text-muted-foreground">Manage advance item sales and time-based bookings.</p>
      </header>

      <Tabs defaultValue="advance">
        <TabsList>
          <TabsTrigger value="advance">Advance Item Sales</TabsTrigger>
          <TabsTrigger value="booking">Appointment & Booking</TabsTrigger>
        </TabsList>

        {/* ═══ ADVANCE ITEM SALES TAB ═══ */}
        <TabsContent value="advance" className="space-y-4">
          <Button onClick={openAdvDlg} className="gap-1"><Plus className="h-4 w-4" /> New Advance Order</Button>

          {/* Advance Lodge - date range share PDF */}
          <AdvanceLodgeSection advanceOrders={advanceOrders} settings={settings} />

          {advanceOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No advance orders yet.</p>
          ) : (
            <div className="space-y-2">
              {advanceOrders.map((o) => (
                <Card key={o.id} className={o.status === "cancelled" ? "opacity-60" : ""}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-sm font-medium">
                          Adv #{o.receiptNo} — {o.lines.map((l) => l.name).join(", ") || "Advance Order"}
                        </div>
                        {o.customerName && <div className="text-xs text-muted-foreground">{o.customerName} {o.customerPhone ? `• ${o.customerPhone}` : ""}</div>}
                        {(o.deliveryDate || o.deliveryTime) && (
                          <div className="text-xs text-muted-foreground">
                            Delivery: {o.deliveryDate ? fmtDate(o.deliveryDate) : ""}{o.deliveryTime ? ` at ${fmtTime12(o.deliveryTime)}` : ""}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">{fmtDateTime(o.createdAt)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusColor(o.status)}>{o.status}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Total:</span> {formatIntMoney(o.total)}</div>
                      {(o.discountAmount ?? 0) > 0 && <div><span className="text-muted-foreground">Discount:</span> {formatIntMoney(o.discountAmount)}</div>}
                      <div><span className="text-muted-foreground">Advance:</span> {formatIntMoney(o.advancePayment)}</div>
                      <div><span className="text-muted-foreground">Remaining:</span> {formatIntMoney(o.remainingPayment)}</div>
                    </div>
                    {o.cancelledReason && <div className="text-xs text-destructive">Reason: {o.cancelledReason}</div>}
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {o.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => completeAdvance(o.id)}><Check className="h-3 w-3" /> Complete</Button>
                          <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => { setCancelId({ id: o.id, type: "advance" }); setCancelReason(""); }}><Ban className="h-3 w-3" /> Cancel</Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => void reprintAdvance(o)}><Printer className="h-3 w-3" /> Print</Button>
                      <Button size="sm" variant="ghost" className="gap-1" onClick={async () => { try { await printAdvanceKot(o); toast({ title: "KOT printed" }); } catch (e: any) { toast({ title: "KOT failed", description: e?.message, variant: "destructive" }); } }}><FileText className="h-3 w-3" /> KOT</Button>
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => void shareAdvancePdf(o)}><Share2 className="h-3 w-3" /> Share PDF</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ TIME-BASED BOOKING TAB ═══ */}
        <TabsContent value="booking" className="space-y-4">
          {/* Bookable Items Management (admin) */}
          {isAdmin && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Bookable Items</CardTitle>
                <CardDescription>Add items that can be booked by time (e.g. Room, Court).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input value={newBIName} onChange={(e) => setNewBIName(e.target.value)} placeholder="e.g. Room A" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Price (optional)</Label>
                    <Input type="number" inputMode="numeric" value={newBIPrice} onChange={(e) => setNewBIPrice(e.target.value)} placeholder="0" className="w-24" />
                  </div>
                  <Button onClick={() => void addBookableItem()} size="sm" className="gap-1"><Plus className="h-3 w-3" /> Add</Button>
                </div>
                {bookableItems.length > 0 && (
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/50"><th className="px-3 py-1.5 text-left font-medium">Name</th><th className="px-3 py-1.5 text-left font-medium">Price</th><th className="px-3 py-1.5 w-10"></th></tr></thead>
                      <tbody>
                        {bookableItems.map((bi) => (
                          <tr key={bi.id} className="border-b last:border-0">
                            <td className="px-3 py-1.5">{bi.name}</td>
                            <td className="px-3 py-1.5">{formatIntMoney(bi.price)}</td>
                            <td className="px-3 py-1.5"><Button variant="ghost" size="icon" onClick={() => deleteBookableItem(bi.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Button onClick={openBookDlg} disabled={bookableItems.length === 0} className="gap-1"><Plus className="h-4 w-4" /> New Booking</Button>
          {bookableItems.length === 0 && <p className="text-xs text-muted-foreground">Admin needs to add bookable items first.</p>}

          {/* Booking Lodge - date range share PDF */}
          <BookingLodgeSection bookingOrders={bookingOrders} settings={settings} />

          {bookingOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <div className="space-y-2">
              {bookingOrders.map((o) => (
                <Card key={o.id} className={o.status === "cancelled" ? "opacity-60" : ""}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                         <div className="text-sm font-medium">
                           Bkg #{o.receiptNo} — {o.bookableItemName}
                           {o.isMaintenance && <span className="ml-1.5 text-xs text-muted-foreground">(Maintenance)</span>}
                         </div>
                         <div className="text-xs text-muted-foreground">
                           {fmtDate(o.date)} • {o.startTime} → {o.endTime} ({o.durationHours >= 24 ? `${Math.round(o.durationHours / 24)}d` : o.durationHours >= 1 ? `${o.durationHours}h` : `${Math.round(o.durationHours * 60)}min`})
                         </div>
                         {o.customerName && <div className="text-xs text-muted-foreground">{o.customerName} {o.customerPhone ? `• ${o.customerPhone}` : ""}</div>}
                       </div>
                       <Badge variant={o.isMaintenance ? "outline" : statusColor(o.status)}>
                         {o.isMaintenance ? "🔧 Maintenance" : o.status}
                       </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Price:</span> {formatIntMoney(o.price)}</div>
                      {(o.discountAmount ?? 0) > 0 && <div><span className="text-muted-foreground">Discount:</span> {formatIntMoney(o.discountAmount)}</div>}
                      <div><span className="text-muted-foreground">Total:</span> {formatIntMoney(o.total)}</div>
                      <div><span className="text-muted-foreground">Advance:</span> {formatIntMoney(o.advancePayment)}</div>
                      <div><span className="text-muted-foreground">Remaining:</span> {formatIntMoney(o.remainingPayment)}</div>
                    </div>
                    {o.cancelledReason && <div className="text-xs text-destructive">Reason: {o.cancelledReason}</div>}
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {o.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => completeBooking(o.id)}><Check className="h-3 w-3" /> Complete</Button>
                          <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => { setCancelId({ id: o.id, type: "booking" }); setCancelReason(""); }}><Ban className="h-3 w-3" /> Cancel</Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => void reprintBooking(o)}><Printer className="h-3 w-3" /> Print</Button>
                      <Button size="sm" variant="ghost" className="gap-1" onClick={async () => { try { await printBookingKot(o); toast({ title: "KOT printed" }); } catch (e: any) { toast({ title: "KOT failed", description: e?.message, variant: "destructive" }); } }}><FileText className="h-3 w-3" /> KOT</Button>
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => void shareBookingPdf(o)}><Share2 className="h-3 w-3" /> Share PDF</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ ADVANCE ORDER DIALOG ═══ */}
      <Dialog open={advDlg} onOpenChange={setAdvDlg}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Advance Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {advLines.map((it, idx) => (
              <div key={it.key} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                  {advLines.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAdvLines((p) => p.filter((l) => l.key !== it.key))}><X className="h-3 w-3" /></Button>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pick from menu (optional)</Label>
                  <select
                    value=""
                    onChange={(e) => {
                      const sel = menuItems.find((m) => m.id === e.target.value);
                      if (sel) updateAdvLine(it.key, { itemId: sel.id, name: sel.name, unitPrice: sel.price });
                    }}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">— Pick from menu —</option>
                    {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name} ({formatIntMoney(m.price)})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Item Name</Label>
                  <Input value={it.name} onChange={(e) => updateAdvLine(it.key, { name: e.target.value })} placeholder="Type item name manually" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Qty (optional)</Label>
                    <Input type="number" inputMode="numeric" value={it.qty || ""} onChange={(e) => updateAdvLine(it.key, { qty: Number(e.target.value) || 0 })} placeholder="—" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit Price (optional)</Label>
                    <Input type="number" inputMode="numeric" value={it.unitPrice || ""} onChange={(e) => updateAdvLine(it.key, { unitPrice: Number(e.target.value) || 0 })} placeholder="—" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <select value={it.unit || "pcs"} onChange={(e) => updateAdvLine(it.key, { unit: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                      <option value="pcs">Pieces</option>
                      <option value="kg">Kg</option>
                      <option value="ltr">Liters</option>
                      <option value="ft">Feet</option>
                      <option value="m">Meters</option>
                    </select>
                  </div>
                </div>
                {it.subtotal > 0 && (
                  <div className="text-xs text-muted-foreground">Subtotal: {formatIntMoney(it.subtotal)}</div>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setAdvLines((p) => [...p, { key: String(Date.now()), name: "", qty: 0, unitPrice: 0, subtotal: 0, unit: "pcs" }])}>
              <Plus className="h-3 w-3" /> Add Item
            </Button>

            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div className="space-y-1">
                <Label className="text-xs">Calculated Total</Label>
                <div className="text-sm font-semibold">{formatIntMoney(advCalcTotal)}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Manual Total (optional)</Label>
                <Input type="number" inputMode="numeric" value={advManualTotal} onChange={(e) => setAdvManualTotal(e.target.value)} placeholder="Override" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Discount</Label>
                <Input type="number" inputMode="numeric" value={advDiscount} onChange={(e) => setAdvDiscount(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Advance Payment</Label>
                <Input type="number" inputMode="numeric" value={advAdvance} onChange={(e) => setAdvAdvance(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Remaining</Label>
                <div className="h-9 flex items-center text-sm font-semibold">{formatIntMoney(advRemaining)}</div>
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-medium text-muted-foreground">Delivery Date / Time (optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={advDeliveryDate} onChange={(e) => setAdvDeliveryDate(e.target.value)} />
                <Input type="time" value={advDeliveryTime} onChange={(e) => setAdvDeliveryTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-medium text-muted-foreground">Customer (optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={advCustName} onChange={(e) => setAdvCustName(e.target.value)} placeholder="Name" />
                <Input value={advCustPhone} onChange={(e) => setAdvCustPhone(e.target.value)} placeholder="Phone" inputMode="tel" />
              </div>
              <Input value={advCustAddress} onChange={(e) => setAdvCustAddress(e.target.value)} placeholder="Address" />
            </div>
          </div>
          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAdvDlg(false)}>Cancel</Button>
            <Button variant="outline" className="gap-1" onClick={() => void saveAndKotAdvance()}><FileText className="h-4 w-4" /> KOT</Button>
            <Button variant="outline" className="gap-1" onClick={() => void saveAndPrintAdvance()}><Printer className="h-4 w-4" /> Print</Button>
            <Button onClick={() => void saveAdvance()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ BOOKING DIALOG ═══ */}
      <Dialog open={bookDlg} onOpenChange={setBookDlg}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Booking</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Select Item</Label>
              <select value={bookItemId} onChange={(e) => setBookItemId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {bookableItems.map((b) => <option key={b.id} value={b.id}>{b.name} — {formatIntMoney(b.price)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={bookDate} onChange={(e) => setBookDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Time</Label>
                <Input type="time" value={bookStart} onChange={(e) => setBookStart(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Duration Unit</Label>
              <div className="flex gap-3">
                {(["minutes", "hours", "days"] as DurationUnit[]).map((u) => (
                  <label key={u} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="durationUnit"
                      checked={bookDurationUnit === u}
                      onChange={() => setBookDurationUnit(u)}
                      className="accent-primary"
                    />
                    <span className="text-sm capitalize">{u}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Duration ({bookDurationUnit})</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step={bookDurationUnit === "minutes" ? "15" : "0.5"}
                  value={bookDuration}
                  onChange={(e) => setBookDuration(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Time</Label>
                <div className="h-10 flex items-center text-sm font-semibold border rounded-md px-3 bg-muted/30">{bookEndTime}</div>
              </div>
            </div>

            {/* Overlap warning */}
            {getOverlaps().length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                {getOverlaps().some((o) => o.isMaintenance)
                  ? "🚫 Not Available — This slot is blocked for maintenance."
                  : "⚠️ This item is already booked at overlapping times on this date. You can still proceed."}
              </div>
            )}

            {/* Maintenance checkbox */}
            <div className="flex items-center gap-2 border-t pt-3">
              <Checkbox
                id="bookMaintenance"
                checked={bookIsMaintenance}
                onCheckedChange={(v) => setBookIsMaintenance(!!v)}
              />
              <label htmlFor="bookMaintenance" className="text-sm cursor-pointer flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" /> Maintenance / Not Available
              </label>
            </div>
            {bookIsMaintenance && (
              <div className="text-xs text-muted-foreground">This will block the time slot and will NOT count in sales.</div>
            )}

            {!bookIsMaintenance && (
              <>
                <div className="grid grid-cols-2 gap-3 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Price {bookItemPrice > 0 ? `(default: ${formatIntMoney(bookItemPrice)})` : ""}</Label>
                    <Input type="number" inputMode="numeric" value={bookManualPrice} onChange={(e) => setBookManualPrice(e.target.value)} placeholder={bookItemPrice > 0 ? String(bookItemPrice) : "Enter price"} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Discount</Label>
                    <Input type="number" inputMode="numeric" value={bookDiscount} onChange={(e) => setBookDiscount(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Total</Label>
                    <div className="h-9 flex items-center text-sm font-semibold">{formatIntMoney(bookTotal)}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Advance</Label>
                    <Input type="number" inputMode="numeric" value={bookAdvance} onChange={(e) => setBookAdvance(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Remaining</Label>
                    <div className="h-9 flex items-center text-sm font-semibold">{formatIntMoney(bookRemaining)}</div>
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs font-medium text-muted-foreground">Customer (optional)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={bookCustName} onChange={(e) => setBookCustName(e.target.value)} placeholder="Name" />
                    <Input value={bookCustPhone} onChange={(e) => setBookCustPhone(e.target.value)} placeholder="Phone" inputMode="tel" />
                  </div>
                  <Input value={bookCustAddress} onChange={(e) => setBookCustAddress(e.target.value)} placeholder="Address" />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBookDlg(false)}>Cancel</Button>
            <Button variant="outline" className="gap-1" onClick={async () => { const order = await buildBookingOrder(); if (!order) return; setBookDlg(false); void refresh(); try { await printBookingKot(order); toast({ title: `Booking #${order.receiptNo} saved & KOT printed` }); } catch (e: any) { toast({ title: "Saved but KOT failed", description: e?.message, variant: "destructive" }); } }}><FileText className="h-4 w-4" /> KOT</Button>
            <Button variant="outline" className="gap-1" onClick={() => void saveAndPrintBooking()}><Printer className="h-4 w-4" /> Print</Button>
            <Button onClick={() => void saveBooking()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CANCEL DIALOG ═══ */}
      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelId?.type === "advance" ? "Order" : "Booking"}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. Please provide a reason.{cancelId?.type === "booking" ? " The time slot will become available for new bookings." : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation" />
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doCancelOrder()} disabled={!cancelReason.trim()}>Confirm Cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
