/**
 * Admin Kitchen Orders — Shows kitchen order queue directly from local DB.
 * No network login needed; this is for the Main device admin.
 */
import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ChefHat, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { db } from "@/db/appDb";
import type { KitchenOrder, KitchenOrderStatus } from "@/db/kitchen-schema";
import { updateKitchenOrderStatus } from "@/features/kitchen/kitchen-handler";

const STATUS_FLOW: KitchenOrderStatus[] = ["pending", "preparing", "ready", "served"];

const STATUS_LABELS: Record<KitchenOrderStatus, string> = {
  pending: "New Order",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<KitchenOrderStatus, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  preparing: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  ready: "bg-green-500/10 text-green-700 border-green-500/30",
  served: "bg-muted text-muted-foreground border-muted",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const CARD_BORDERS: Record<KitchenOrderStatus, string> = {
  pending: "border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20",
  preparing: "border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20",
  ready: "border-green-500/50 bg-green-50/50 dark:bg-green-950/20",
  served: "border-muted",
  cancelled: "border-destructive/30",
};

export default function AdminKitchenPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [filter, setFilter] = useState<"active" | "all">("active");

  const loadOrders = useCallback(async () => {
    const all = await db.kitchenOrders.orderBy("createdAt").reverse().limit(100).toArray();
    setOrders(all);
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 3000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const advanceStatus = async (order: KitchenOrder) => {
    const idx = STATUS_FLOW.indexOf(order.status);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    await updateKitchenOrderStatus(order.id, next);
    toast({ title: `Order #${order.orderNumber} → ${STATUS_LABELS[next]}` });
    loadOrders();
  };

  const filtered = filter === "active"
    ? orders.filter(o => o.status !== "served" && o.status !== "cancelled")
    : orders;

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Kitchen Orders</h1>
          <p className="text-sm text-muted-foreground">View and manage kitchen order queue.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={filter === "active" ? "default" : "outline"} size="sm" onClick={() => setFilter("active")}>
            Active
          </Button>
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
            All
          </Button>
          <Button variant="outline" size="icon" onClick={loadOrders}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg">No kitchen orders</p>
          <p className="text-sm">Orders will appear here when sent from POS.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(order => (
          <Card key={order.id} className={`border-2 ${CARD_BORDERS[order.status]}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg">#{order.orderNumber}</span>
                <Badge className={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
              </div>

              {(order.tableNumber || order.customerName) && (
                <div className="text-sm text-muted-foreground">
                  {order.tableNumber && <span>Table {order.tableNumber}</span>}
                  {order.tableNumber && order.customerName && <span> · </span>}
                  {order.customerName && <span>{order.customerName}</span>}
                </div>
              )}

              <div className="space-y-1">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{item.name}</span>
                    <span className="font-medium">×{item.qty}</span>
                  </div>
                ))}
              </div>

              {order.note && (
                <p className="text-xs italic text-muted-foreground border-t pt-2">{order.note}</p>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {fmtTime(order.createdAt)}
                </span>
                {order.status !== "served" && order.status !== "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => advanceStatus(order)}>
                    {order.status === "pending" && "Start Preparing"}
                    {order.status === "preparing" && "Mark Ready"}
                    {order.status === "ready" && "Mark Served"}
                  </Button>
                )}
                {order.status === "served" && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> Served
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
