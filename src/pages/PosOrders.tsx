import * as React from "react";
import { db } from "@/db/appDb";
import type { CreditCustomer, DeliveryPerson, Order, TableOrder, RestaurantTable, Waiter } from "@/db/schema";
import { ensureSeedData } from "@/db/seed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { formatIntMoney } from "@/features/pos/format";
import { cancelOrder } from "@/features/pos/pos-db";
import { useToast } from "@/hooks/use-toast";
import { isSameLocalDay } from "@/features/pos/time";

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
  source: "regular" | "table";
  order?: Order; // always set (converted for table orders too)
  tableNumber?: string;
  waiterName?: string;
};

export default function PosOrders() {
  const { toast } = useToast();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [customers, setCustomers] = React.useState<CreditCustomer[]>([]);
  const [deliveryPersons, setDeliveryPersons] = React.useState<DeliveryPerson[]>([]);
  const [tableOrders, setTableOrders] = React.useState<TableOrder[]>([]);
  const [tables, setTables] = React.useState<RestaurantTable[]>([]);
  const [waiters, setWaiters] = React.useState<Waiter[]>([]);

  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [cancelTarget, setCancelTarget] = React.useState<{ id: string; source: "regular" | "table" } | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");

  const refresh = React.useCallback(async () => {
    await ensureSeedData();
    const [ords, custs, dps, tOrds, tbls, wtrs] = await Promise.all([
      db.orders.orderBy("createdAt").reverse().limit(200).toArray(),
      db.customers.orderBy("createdAt").toArray(),
      db.deliveryPersons.orderBy("createdAt").toArray(),
      db.tableOrders.where("status").anyOf(["completed", "cancelled"]).reverse().limit(200).toArray(),
      db.restaurantTables.toArray(),
      db.waiters.toArray(),
    ]);
    setOrders(ords);
    setCustomers(custs);
    setDeliveryPersons(dps);
    setTableOrders(tOrds);
    setTables(tbls);
    setWaiters(wtrs);
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
      .filter((t) => t.receiptNo != null)
      .map((t) => ({
        id: t.id,
        receiptNo: t.receiptNo!,
        paymentMethod: t.paymentMethod ?? "cash",
        status: t.status,
        total: t.total,
        createdAt: t.completedAt ?? t.updatedAt,
        source: "table",
        order: tableOrderToOrder(t, tablesById, waitersById),
        tableNumber: tablesById[t.tableId]?.tableNumber,
        waiterName: waitersById[t.waiterId]?.name,
      }));
    return [...regular, ...table].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
  }, [orders, tableOrders, tablesById, waitersById]);

  const openCancelDialog = (id: string, source: "regular" | "table") => {
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
      } else {
        // Cancel table order
        const tOrder = tableOrders.find((o) => o.id === cancelTarget.id);
        if (!tOrder) throw new Error("Table order not found");
        if (tOrder.status !== "completed") throw new Error("Only completed orders can be cancelled");
        if (!isSameLocalDay(tOrder.completedAt ?? tOrder.createdAt, Date.now())) throw new Error("Same-day cancellation only");
        
        await db.tableOrders.update(cancelTarget.id, {
          status: "cancelled",
          cancelledReason: cancelReason.trim(),
          updatedAt: Date.now(),
        });
        
        // Restock inventory for tracked items
        for (const l of tOrder.lines) {
          const item = await db.items.get(l.itemId);
          if (!item?.trackInventory) continue;
          const row = await db.inventory.get(l.itemId);
          const current = row?.quantity ?? 0;
          await db.inventory.put({ itemId: l.itemId, quantity: current + l.qty, updatedAt: Date.now() });
        }
      }
      toast({ title: "Order cancelled" });
      setCancelDialogOpen(false);
      await refresh();
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const now = Date.now();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">View receipts and cancel same-day orders.</p>
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
                const canCancel = o.status === "completed" && isSameLocalDay(o.createdAt, now);
                return (
                  <div key={o.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        Receipt {o.receiptNo}
                        {o.source === "table" && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (Table{o.tableNumber ? ` ${o.tableNumber}` : ""}{o.waiterName ? ` • ${o.waiterName}` : ""})
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {new Date(o.createdAt).toLocaleString()} • {o.paymentMethod} • {o.status}
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
              This will cancel the order and restock inventory. This action cannot be undone.
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
