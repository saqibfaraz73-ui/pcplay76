import * as React from "react";
import { db } from "@/db/appDb";
import type { CreditCustomer, DeliveryPerson, Order, Settings, TableOrder, RestaurantTable, Waiter } from "@/db/schema";
import type { AdvanceOrder, BookingOrder } from "@/db/booking-schema";
import { ensureSeedData } from "@/db/seed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { formatIntMoney, fmtDateTime } from "@/features/pos/format";
import { cancelOrder } from "@/features/pos/pos-db";
import { printAdvanceReceipt, printBookingReceipt } from "@/features/pos/advance-receipt";
import { printReceiptFromOrder } from "@/features/pos/receipt-print";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import { isSameLocalDay } from "@/features/pos/time";
import { Printer } from "lucide-react";

// Convert TableOrder to Order-like shape for ReceiptDialog
function tableOrderToOrder(t: TableOrder, tablesById: Record<string, RestaurantTable>, waitersById: Record<string, Waiter>): Order {
  const tableName = tablesById[t.tableId]?.tableNumber;
  const waiterName = waitersById[t.waiterId]?.name;
  return {
    id: t.id,
    receiptNo: t.receiptNo ?? 0,
    cashier: t.cashier ?? (waiterName ? `Waiter: ${waiterName}` : "Unknown"),
    status: t.status as "completed" | "cancelled",
    paymentMethod: (t.paymentMethod ?? "cash") as any,
    creditCustomerId: t.creditCustomerId,
    discount: t.discountTotal > 0 ? { type: "amount", value: t.discountTotal } : { type: "none" },
    lines: t.lines.map((l) => ({
      itemId: l.itemId,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      subtotal: l.subtotal,
    })),
    subtotal: t.subtotal,
    discountTotal: t.discountTotal,
    taxAmount: t.taxAmount,
    serviceChargeAmount: t.serviceChargeAmount,
    total: t.total,
    cancelledReason: t.cancelledReason,
    workPeriodId: t.workPeriodId,
    createdAt: t.completedAt ?? t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// Unified order type for display
type UnifiedOrder = {
  id: string;
  receiptNo: number;
  paymentMethod: string;
  status: string;
  total: number;
  createdAt: number;
  source: "regular" | "table" | "advance" | "booking";
  order?: Order; // set for regular + table orders
  advanceOrder?: AdvanceOrder;
  bookingOrder?: BookingOrder;
  tableNumber?: string;
  waiterName?: string;
  label?: string;
};

type OrderTab = "all" | "sales" | "tables" | "delivery" | "synced";
export default function PosOrders() {
  const { toast } = useToast();
  const { session } = useAuth();
  const [activeTab, setActiveTab] = React.useState<OrderTab>("all");
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [customers, setCustomers] = React.useState<CreditCustomer[]>([]);
  const [deliveryPersons, setDeliveryPersons] = React.useState<DeliveryPerson[]>([]);
  const [tableOrders, setTableOrders] = React.useState<TableOrder[]>([]);
  const [tables, setTables] = React.useState<RestaurantTable[]>([]);
  const [waiters, setWaiters] = React.useState<Waiter[]>([]);
  const [advanceOrders, setAdvanceOrders] = React.useState<AdvanceOrder[]>([]);
  const [bookingOrders, setBookingOrders] = React.useState<BookingOrder[]>([]);
  const [posSettings, setPosSettings] = React.useState<Settings | null>(null);

  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [cancelTarget, setCancelTarget] = React.useState<{ id: string; source: "regular" | "table" | "advance" | "booking" } | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");

  const refresh = React.useCallback(async () => {
    await ensureSeedData();
    const [ords, custs, dps, tOrds, tbls, wtrs, advOrds, bkOrds, settings] = await Promise.all([
      db.orders.orderBy("createdAt").reverse().limit(200).toArray(),
      db.customers.orderBy("createdAt").toArray(),
      db.deliveryPersons.orderBy("createdAt").toArray(),
      db.tableOrders.where("status").anyOf(["open", "completed", "cancelled"]).reverse().limit(200).toArray(),
      db.restaurantTables.toArray(),
      db.waiters.toArray(),
      db.advanceOrders.orderBy("createdAt").reverse().limit(100).toArray(),
      db.bookingOrders.orderBy("createdAt").reverse().limit(100).toArray(),
      db.settings.get("app"),
    ]);
    setOrders(ords);
    setCustomers(custs);
    setDeliveryPersons(dps);
    setTableOrders(tOrds);
    setTables(tbls);
    setWaiters(wtrs);
    setAdvanceOrders(advOrds);
    setBookingOrders(bkOrds);
    setPosSettings(settings ?? null);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const customersById = React.useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const deliveryPersonsById = React.useMemo(() => Object.fromEntries(deliveryPersons.map((p) => [p.id, p])), [deliveryPersons]);
  const tablesById = React.useMemo(() => Object.fromEntries(tables.map((t) => [t.id, t])), [tables]);
  const waitersById = React.useMemo(() => Object.fromEntries(waiters.map((w) => [w.id, w])), [waiters]);

  const unifiedOrders = React.useMemo<UnifiedOrder[]>(() => {
    const regular: UnifiedOrder[] = orders.map((o) => ({
      id: o.id,
      receiptNo: o.receiptNo,
      paymentMethod: o.paymentMethod,
      status: o.status,
      total: o.total,
      createdAt: o.createdAt,
      source: "regular",
      order: o,
    }));
    const table: UnifiedOrder[] = tableOrders
      .map((t) => ({
        id: t.id,
        receiptNo: t.receiptNo ?? 0,
        paymentMethod: t.paymentMethod ?? "cash",
        status: t.status,
        total: t.total,
        createdAt: t.status === "open" ? t.createdAt : (t.completedAt ?? t.updatedAt),
        source: "table" as const,
        order: t.status !== "open" ? tableOrderToOrder(t, tablesById, waitersById) : undefined,
        tableNumber: tablesById[t.tableId]?.tableNumber,
        waiterName: waitersById[t.waiterId]?.name,
      }));
    const advance: UnifiedOrder[] = advanceOrders.map((o) => ({
      id: o.id,
      receiptNo: o.receiptNo,
      paymentMethod: "advance",
      status: o.status,
      total: o.total,
      createdAt: o.createdAt,
      source: "advance",
      advanceOrder: o,
      label: o.lines.map((l) => l.name).join(", ") || "Advance",
    }));
    const booking: UnifiedOrder[] = bookingOrders.map((o) => ({
      id: o.id,
      receiptNo: o.receiptNo,
      paymentMethod: "booking",
      status: o.status,
      total: o.total,
      createdAt: o.createdAt,
      source: "booking",
      bookingOrder: o,
      label: o.bookableItemName,
    }));
    return [...regular, ...table, ...advance, ...booking].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
  }, [orders, tableOrders, advanceOrders, bookingOrders, tablesById, waitersById]);

  const openCancelDialog = (id: string, source: "regular" | "table" | "advance" | "booking") => {
    setCancelTarget({ id, source });
    setCancelReason("");
    setCancelDialogOpen(true);
  };

  const handleCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    try {
      if (cancelTarget.source === "regular") {
        await cancelOrder({ orderId: cancelTarget.id, reason: cancelReason });
      } else if (cancelTarget.source === "table") {
        const tOrder = tableOrders.find((o) => o.id === cancelTarget.id);
        if (!tOrder) throw new Error("Table order not found");
        if (tOrder.status !== "completed" && tOrder.status !== "open") throw new Error("Only open or completed orders can be cancelled");
        if (tOrder.status === "completed" && !isSameLocalDay(tOrder.completedAt ?? tOrder.createdAt, Date.now())) throw new Error("Same-day cancellation only");
        
        await db.tableOrders.update(cancelTarget.id, {
          status: "cancelled",
          cancelledReason: cancelReason.trim(),
          updatedAt: Date.now(),
        });
        
        for (const l of tOrder.lines) {
          const item = await db.items.get(l.itemId);
          if (!item?.trackInventory) continue;
          const row = await db.inventory.get(l.itemId);
          const current = row?.quantity ?? 0;
          await db.inventory.put({ itemId: l.itemId, quantity: current + l.qty, updatedAt: Date.now() });
        }
      } else if (cancelTarget.source === "advance") {
        const adv = advanceOrders.find((o) => o.id === cancelTarget.id);
        if (!adv) throw new Error("Advance order not found");
        if (adv.status === "cancelled") throw new Error("Already cancelled");
        await db.advanceOrders.update(cancelTarget.id, {
          status: "cancelled",
          cancelledReason: cancelReason.trim(),
          updatedAt: Date.now(),
        });
      } else if (cancelTarget.source === "booking") {
        const bk = bookingOrders.find((o) => o.id === cancelTarget.id);
        if (!bk) throw new Error("Booking not found");
        if (bk.status === "cancelled") throw new Error("Already cancelled");
        // Cancelling frees up the time slot
        await db.bookingOrders.update(cancelTarget.id, {
          status: "cancelled",
          cancelledReason: cancelReason.trim(),
          updatedAt: Date.now(),
        });
      }
      toast({ title: "Order cancelled" });
      setCancelDialogOpen(false);
      await refresh();
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const handleReprint = async (o: UnifiedOrder) => {
    try {
      if (o.source === "advance" && o.advanceOrder) {
        await printAdvanceReceipt(o.advanceOrder);
      } else if (o.source === "booking" && o.bookingOrder) {
        await printBookingReceipt(o.bookingOrder);
      } else if (o.order) {
        // Regular or table order — reprint receipt
        const custName = o.order.creditCustomerId
          ? customersById[o.order.creditCustomerId]?.name
          : undefined;
        const dpName = o.order.deliveryPersonId
          ? deliveryPersonsById[o.order.deliveryPersonId]?.name
          : undefined;
        await printReceiptFromOrder(o.order, {
          creditCustomerName: custName,
          deliveryPersonName: dpName,
          section: o.source === "table" ? "tables" : "sales",
          reprint: true,
        });
      }
      toast({ title: "Reprinted" });
    } catch (e: any) {
      toast({ title: "Print failed", description: e?.message, variant: "destructive" });
    }
  };

  const now = Date.now();

  const sourceLabel = (o: UnifiedOrder) => {
    if (o.source === "table") return `Table${o.tableNumber ? ` ${o.tableNumber}` : ""}${o.waiterName ? ` • ${o.waiterName}` : ""}`;
    if (o.source === "advance") return "Advance";
    if (o.source === "booking") return "Booking";
    return null;
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">View receipts and cancel orders.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {unifiedOrders.length === 0 ? (
            <div className="text-sm text-muted-foreground">No orders yet.</div>
          ) : (
            <div className="space-y-2">
              {unifiedOrders.map((o) => {
                const isCashier = session?.role === "cashier";
                const canCancelByRole = !isCashier || posSettings?.cashierCancelOrderEnabled !== false;
                const canCancel = canCancelByRole && (
                  (o.source === "regular" && o.status === "completed" && isSameLocalDay(o.createdAt, now)) ||
                  (o.source === "table" && (o.status === "open" || (o.status === "completed" && isSameLocalDay(o.createdAt, now)))) ||
                  ((o.source === "advance" || o.source === "booking") && o.status !== "cancelled"));
                  ((o.source === "advance" || o.source === "booking") && o.status !== "cancelled");
                const isOpenTableOrder = o.source === "table" && o.status === "open";
                const src = sourceLabel(o);
                return (
                  <div key={o.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {o.source === "advance" || o.source === "booking"
                          ? `${o.source === "advance" ? "Adv" : "Bkg"} #${o.receiptNo}`
                          : `Receipt ${o.receiptNo}`
                        }
                        {src && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({src})
                          </span>
                        )}
                        {o.label && <span className="ml-1 text-xs text-muted-foreground">— {o.label}</span>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {fmtDateTime(o.createdAt)} • {o.paymentMethod} • {o.status}
                        {isOpenTableOrder && <Badge variant="outline" className="ml-1 text-[10px] border-destructive text-destructive">OPEN</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{formatIntMoney(o.total)}</div>
                      {o.order && (
                        <ReceiptDialog
                          order={o.order}
                          customersById={customersById}
                          deliveryPersonsById={deliveryPersonsById}
                          triggerLabel="Open"
                        />
                      )}
                      {o.status === "completed" && (
                        <Button variant="ghost" size="sm" onClick={() => void handleReprint(o)}>
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openCancelDialog(o.id, o.source)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Order Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {cancelTarget?.source === "booking"
                ? "This will cancel the booking and free up the time slot."
                : "This will cancel the order. This action cannot be undone."}
            </p>
            <div className="space-y-2">
              <Label htmlFor="cancelReason">Reason for cancellation</Label>
              <Input
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
