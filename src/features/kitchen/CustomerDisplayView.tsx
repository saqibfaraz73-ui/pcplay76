/**
 * Customer Display View — Read-only TV-friendly view
 * showing order numbers and their statuses.
 */
import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChefHat, Clock, CheckCircle2, Flame, LogOut } from "lucide-react";
import type { KitchenOrder, KitchenOrderStatus } from "@/db/kitchen-schema";
import { fetchKitchenDisplay } from "./kitchen-sync";
import { playKitchenBell } from "./kitchen-bell";

interface CustomerDisplayViewProps {
  onDisconnect: () => void;
}

const STATUS_CONFIG: Record<KitchenOrderStatus, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  pending: {
    label: "In Queue",
    icon: <Clock className="h-5 w-5" />,
    color: "text-yellow-600",
    bg: "bg-yellow-500/10 border-yellow-500/30",
  },
  preparing: {
    label: "Preparing",
    icon: <Flame className="h-5 w-5" />,
    color: "text-orange-600",
    bg: "bg-orange-500/10 border-orange-500/30",
  },
  ready: {
    label: "Ready!",
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: "text-green-600",
    bg: "bg-green-500/10 border-green-500/30",
  },
  served: { label: "Served", icon: null, color: "text-muted-foreground", bg: "" },
  cancelled: { label: "Cancelled", icon: null, color: "text-destructive", bg: "" },
};

export function CustomerDisplayView({ onDisconnect }: CustomerDisplayViewProps) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [readyCount, setReadyCount] = useState(0);

  const loadOrders = useCallback(async () => {
    const fetched = await fetchKitchenDisplay();
    // Play bell when new order becomes ready
    const newReadyCount = fetched.filter(o => o.status === "ready").length;
    if (newReadyCount > readyCount) {
      playKitchenBell();
    }
    setReadyCount(newReadyCount);
    setOrders(fetched);
  }, [readyCount]);

  // Poll every 3 seconds
  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 3000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const pendingOrders = orders.filter(o => o.status === "pending");
  const preparingOrders = orders.filter(o => o.status === "preparing");
  const readyOrders = orders.filter(o => o.status === "ready");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChefHat className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Order Status</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <Button variant="ghost" size="sm" onClick={onDisconnect}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Three columns layout */}
      <div className="grid grid-cols-3 gap-0 min-h-[calc(100vh-73px)]">
        {/* In Queue */}
        <div className="border-r p-4">
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 text-yellow-600 mb-1">
              <Clock className="h-5 w-5" />
              <h2 className="text-lg font-bold">In Queue</h2>
            </div>
            <Badge variant="secondary">{pendingOrders.length} orders</Badge>
          </div>
          <div className="space-y-3">
            {pendingOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>

        {/* Preparing */}
        <div className="border-r p-4 bg-orange-50/30 dark:bg-orange-950/10">
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 text-orange-600 mb-1">
              <Flame className="h-5 w-5" />
              <h2 className="text-lg font-bold">Preparing</h2>
            </div>
            <Badge variant="secondary">{preparingOrders.length} orders</Badge>
          </div>
          <div className="space-y-3">
            {preparingOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>

        {/* Ready */}
        <div className="p-4 bg-green-50/30 dark:bg-green-950/10">
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 text-green-600 mb-1">
              <CheckCircle2 className="h-5 w-5" />
              <h2 className="text-lg font-bold">Ready!</h2>
            </div>
            <Badge variant="secondary">{readyOrders.length} orders</Badge>
          </div>
          <div className="space-y-3">
            {readyOrders.map(order => (
              <ReadyCard key={order.id} order={order} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: KitchenOrder }) {
  const elapsed = Math.floor((Date.now() - order.createdAt) / 60000);
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl font-bold">#{order.orderNumber}</span>
        <span className="text-xs text-muted-foreground">{elapsed}m</span>
      </div>
      {order.tableNumber && (
        <p className="text-xs text-muted-foreground mb-1">Table {order.tableNumber}</p>
      )}
      <div className="space-y-0.5">
        {order.items.map((item, i) => (
          <p key={i} className="text-sm">{item.qty}x {item.name}</p>
        ))}
      </div>
    </div>
  );
}

function ReadyCard({ order }: { order: KitchenOrder }) {
  return (
    <div className="rounded-lg border-2 border-green-500/50 bg-green-500/10 p-4 shadow-sm animate-pulse">
      <div className="text-center">
        <span className="text-3xl font-bold text-green-700 dark:text-green-400">
          #{order.orderNumber}
        </span>
        {order.tableNumber && (
          <p className="text-sm text-green-600 mt-1">Table {order.tableNumber}</p>
        )}
        {order.customerName && (
          <p className="text-sm font-medium mt-1">{order.customerName}</p>
        )}
      </div>
    </div>
  );
}
