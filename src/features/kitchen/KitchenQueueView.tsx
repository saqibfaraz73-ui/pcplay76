/**
 * Kitchen Queue View — Large cards showing order items, tap to update status.
 * Used by kitchen staff.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChefHat, Clock, CheckCircle2, Bell, LogOut } from "lucide-react";
import type { KitchenOrder, KitchenOrderStatus } from "@/db/kitchen-schema";
import { fetchKitchenOrders, sendKitchenStatusUpdate } from "./kitchen-sync";
import { playKitchenBell } from "./kitchen-bell";

interface KitchenQueueViewProps {
  onDisconnect: () => void;
}

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

export function KitchenQueueView({ onDisconnect }: KitchenQueueViewProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const prevOrderIdsRef = useRef<Set<string>>(new Set());
  // Track locally updated orders to prevent poll from reverting optimistic updates
  const localUpdatesRef = useRef<Map<string, { status: KitchenOrderStatus; until: number }>>(new Map());

  const loadOrders = useCallback(async () => {
    const fetched = await fetchKitchenOrders();
    
    // Merge: keep local optimistic status if within grace period
    const now = Date.now();
    const merged = fetched.map(order => {
      const local = localUpdatesRef.current.get(order.id);
      if (local && now < local.until) {
        // Server hasn't caught up yet — keep our optimistic status
        return { ...order, status: local.status };
      }
      // Clean up expired entries
      if (local) localUpdatesRef.current.delete(order.id);
      return order;
    });
    
    setOrders(merged);

    // Play bell for new orders
    const currentIds = new Set(fetched.filter(o => o.status === "pending").map(o => o.id));
    const prevIds = prevOrderIdsRef.current;
    for (const id of currentIds) {
      if (!prevIds.has(id)) {
        playKitchenBell();
        break; // one bell per poll
      }
    }
    prevOrderIdsRef.current = new Set(fetched.map(o => o.id));
  }, []);

  // Poll every 3 seconds
  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 3000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleStatusUpdate = async (order: KitchenOrder) => {
    const currentIdx = STATUS_FLOW.indexOf(order.status);
    if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) return;
    const nextStatus = STATUS_FLOW[currentIdx + 1];

    // Optimistic update FIRST — mark as locally updated with 10s grace period
    localUpdatesRef.current.set(order.id, { status: nextStatus, until: Date.now() + 10000 });
    setOrders(prev => prev.map(o =>
      o.id === order.id ? { ...o, status: nextStatus, updatedAt: Date.now() } : o
    ));

    const deviceId = localStorage.getItem("kitchen_device_id") || "kitchen";
    const ok = await sendKitchenStatusUpdate(order.id, nextStatus, deviceId);
    if (!ok) {
      // Revert optimistic update on failure
      localUpdatesRef.current.delete(order.id);
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: order.status } : o
      ));
      toast({ title: "Failed to update", description: "Could not reach Main device", variant: "destructive" });
    }
  };

  const activeOrders = orders.filter(o => o.status !== "served" && o.status !== "cancelled");
  const displayOrders = filter === "active" ? activeOrders : orders;

  const getNextAction = (status: KitchenOrderStatus): string | null => {
    const map: Record<string, string> = {
      pending: "Start Preparing",
      preparing: "Mark Ready",
      ready: "Mark Served",
    };
    return map[status] ?? null;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChefHat className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Kitchen Queue</h1>
            <Badge variant="secondary" className="text-sm">
              {activeOrders.length} active
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={filter === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("active")}
            >
              Active
            </Button>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button variant="ghost" size="sm" onClick={onDisconnect} className="gap-1 ml-2">
              <LogOut className="h-4 w-4" /> Exit
            </Button>
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="mx-auto max-w-7xl p-4">
        {displayOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Bell className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No orders yet</p>
            <p className="text-sm">New orders will appear here with a bell sound</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayOrders.map((order) => {
              const nextAction = getNextAction(order.status);
              const elapsed = Math.floor((Date.now() - order.createdAt) / 60000);
              return (
                <div
                  key={order.id}
                  className={`rounded-xl border-2 p-4 transition-all ${CARD_BORDERS[order.status]}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">#{order.orderNumber}</span>
                      {order.tableNumber && (
                        <Badge variant="outline" className="text-xs">
                          Table {order.tableNumber}
                        </Badge>
                      )}
                    </div>
                    <Badge className={`${STATUS_COLORS[order.status]} border`}>
                      {STATUS_LABELS[order.status]}
                    </Badge>
                  </div>

                  {/* Time */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                    <Clock className="h-3 w-3" />
                    {elapsed}m ago
                    {order.waiterName && <span>• {order.waiterName}</span>}
                  </div>

                  {/* Items */}
                  <div className="space-y-1 mb-4">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="font-medium">{item.qty}x {item.name}</span>
                      </div>
                    ))}
                  </div>

                  {order.note && (
                    <p className="text-xs text-muted-foreground italic mb-3 border-t pt-2">
                      📝 {order.note}
                    </p>
                  )}

                  {/* Action Button */}
                  {nextAction && (
                    <Button
                      className="w-full gap-2"
                      variant={order.status === "pending" ? "default" : "outline"}
                      onClick={() => void handleStatusUpdate(order)}
                    >
                      {order.status === "ready" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <ChefHat className="h-4 w-4" />
                      )}
                      {nextAction}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
