import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/appDb";
import { useAuth } from "@/auth/AuthProvider";
import { useWorkPeriod } from "@/features/pos/WorkPeriodProvider";
import { formatIntMoney, fmtDate, fmtTime12 } from "@/features/pos/format";
import { isSameLocalDay } from "@/features/pos/time";
import type { Order, Expense } from "@/db/schema";
import type { KitchenOrder, KitchenOrderStatus } from "@/db/kitchen-schema";
import { updateKitchenOrderStatus } from "@/features/kitchen/kitchen-handler";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart,
  ClipboardList,
  DollarSign,
  Users,
  Truck,
  UtensilsCrossed,
  CalendarCheck,
  BarChart3,
  Settings,
  TrendingUp,
  TrendingDown,
  Receipt,
  CreditCard,
  Banknote,
  Shield,
  Wifi,
  Trash2,
  ChefHat,
  FileText,
  Clock,
  CheckCircle2,
  Tags,
  BookOpen,
  Hammer,
} from "lucide-react";
import appLogo from "@/assets/app-logo.jpg";

type TodayStats = {
  totalSales: number;
  totalOrders: number;
  creditSales: number;
  deliverySales: number;
  totalExpenses: number;
  netRevenue: number;
};

const KDS_STATUS_LABELS: Record<KitchenOrderStatus, string> = {
  pending: "New", preparing: "Preparing", ready: "Ready", served: "Served", cancelled: "Cancelled",
};
const KDS_STATUS_COLORS: Record<KitchenOrderStatus, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  preparing: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  ready: "bg-green-500/10 text-green-700 border-green-500/30",
  served: "bg-muted text-muted-foreground border-muted",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};
const KDS_FLOW: KitchenOrderStatus[] = ["pending", "preparing", "ready", "served"];

function AdminKdsQueue() {
  const { toast } = useToast();
  const [orders, setOrders] = React.useState<KitchenOrder[]>([]);

  const load = React.useCallback(async () => {
    const all = await db.kitchenOrders.orderBy("createdAt").reverse().limit(20).toArray();
    setOrders(all.filter(o => o.status !== "served" && o.status !== "cancelled"));
  }, []);

  React.useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [load]);

  const advance = async (order: KitchenOrder) => {
    const idx = KDS_FLOW.indexOf(order.status);
    if (idx < 0 || idx >= KDS_FLOW.length - 1) return;
    const next = KDS_FLOW[idx + 1];
    await updateKitchenOrderStatus(order.id, next);
    toast({ title: `#${order.orderNumber} → ${KDS_STATUS_LABELS[next]}` });
    load();
  };

  if (orders.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <ChefHat className="h-4 w-4" /> Kitchen Queue
        </h2>
        <Link to="/admin/kitchen">
          <Button variant="ghost" size="sm" className="text-xs">View All →</Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {orders.slice(0, 6).map(order => (
          <Card key={order.id} className="border shadow-sm">
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">#{order.orderNumber}</span>
                <Badge className={KDS_STATUS_COLORS[order.status]} variant="outline">
                  {KDS_STATUS_LABELS[order.status]}
                </Badge>
              </div>
              <div className="space-y-0.5">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted-foreground">
                    <span className="truncate">{item.name}</span>
                    <span className="font-medium shrink-0 ml-2">×{item.qty}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => advance(order)}>
                  {order.status === "pending" && "Start"}
                  {order.status === "preparing" && "Ready"}
                  {order.status === "ready" && "Served"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function PosHome() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { isWorkPeriodActive } = useWorkPeriod();
  const [stats, setStats] = React.useState<TodayStats | null>(null);
  const [settings, setSettings] = React.useState<{ tableManagementEnabled?: boolean; advanceBookingEnabled?: boolean; deliveryEnabled?: boolean; recoveryEnabled?: boolean; syncEnabled?: boolean; kitchenDisplayEnabled?: boolean; installmentEnabled?: boolean; businessName?: string; taxEnabled?: boolean; taxLabel?: string; taxValue?: number; taxType?: string; taxCountry?: string; taxDepartment?: string } | null>(null);

  React.useEffect(() => {
    loadStats();
    loadSettings();
  }, []);

  async function loadSettings() {
    const s = await db.settings.get("app");
    setSettings(s ?? null);
  }

  async function loadStats() {
    const now = Date.now();
    const allOrders = await db.orders.toArray();
    const todayOrders = allOrders.filter(
      (o) => o.status === "completed" && isSameLocalDay(o.createdAt, now)
    );

    const creditSales = todayOrders
      .filter((o) => o.paymentMethod === "credit")
      .reduce((s, o) => s + o.total, 0);
    const deliverySales = todayOrders
      .filter((o) => o.paymentMethod === "delivery")
      .reduce((s, o) => s + o.total, 0);
    const totalSales = todayOrders.reduce((s, o) => s + o.total, 0);

    const allExpenses = await db.expenses.toArray();
    const todayExpenses = allExpenses.filter((e) => isSameLocalDay(e.createdAt, now));
    const totalExpenses = todayExpenses.reduce((s, e) => s + e.amount, 0);

    setStats({
      totalSales,
      totalOrders: todayOrders.length,
      creditSales,
      deliverySales,
      totalExpenses,
      netRevenue: totalSales - totalExpenses,
    });
  }

  const isAdmin = session?.role === "admin";
  const isCashier = session?.role === "cashier";
  const isWaiter = session?.role === "waiter" || session?.role === "supervisor";
  const businessName = settings?.businessName || "Your Business";

  const quickActions = React.useMemo(() => {
    const actions: { to: string; label: string; icon: React.ElementType; color: string; description: string }[] = [];

    if (!isWaiter) {
      actions.push({
        to: "/pos",
        label: "New Sale",
        icon: ShoppingCart,
        color: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
        description: "Start a new sale",
      });
      actions.push({
        to: "/pos/orders",
        label: "Orders",
        icon: ClipboardList,
        color: "bg-blue-500/10 text-blue-600 border-blue-200",
        description: "View all orders",
      });
      actions.push({
        to: "/pos/expenses",
        label: "Expenses",
        icon: DollarSign,
        color: "bg-orange-500/10 text-orange-600 border-orange-200",
        description: "Track expenses",
      });
      actions.push({
        to: "/pos/credit-lodge",
        label: "Credit Lodge",
        icon: Users,
        color: "bg-purple-500/10 text-purple-600 border-purple-200",
        description: "Credit customers",
      });
      actions.push({
        to: "/daybook",
        label: "Daybook",
        icon: BookOpen,
        color: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
        description: "Cash & bank tracking",
      });
    }

    // Always show these on home page
    actions.push({
      to: "/pos/tables",
      label: "Tables",
      icon: UtensilsCrossed,
      color: "bg-pink-500/10 text-pink-600 border-pink-200",
      description: "Table management",
    });

    if (!isWaiter) {
      actions.push({
        to: "/pos/party-lodge",
        label: "Party Lodge",
        icon: Truck,
        color: "bg-teal-500/10 text-teal-600 border-teal-200",
        description: "Party orders",
      });
      actions.push({
        to: "/pos/advance-booking",
        label: "Booking",
        icon: CalendarCheck,
        color: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
        description: "Appointments",
      });
      actions.push({
        to: "/recovery",
        label: "Recovery",
        icon: Shield,
        color: "bg-amber-500/10 text-amber-600 border-amber-200",
        description: "Payments recovery",
      });
      actions.push({
        to: "/admin/sync",
        label: "Sync",
        icon: Wifi,
        color: "bg-sky-500/10 text-sky-600 border-sky-200",
        description: "Device sync",
      });
    }

    if (!isWaiter && settings?.installmentEnabled) {
      actions.push({
        to: "/installments",
        label: "Installment",
        icon: CreditCard,
        color: "bg-violet-500/10 text-violet-600 border-violet-200",
        description: "Installment management",
      });
      actions.push({
        to: "/custom-print",
        label: "Custom Print",
        icon: FileText,
        color: "bg-slate-500/10 text-slate-600 border-slate-200",
        description: "Custom receipts",
      });
    }

    if (!isWaiter && settings?.deliveryEnabled) {
      actions.push({
        to: "/admin/delivery",
        label: "Delivery",
        icon: Truck,
        color: "bg-lime-500/10 text-lime-600 border-lime-200",
        description: "Delivery management",
      });
    }

    if (!isWaiter && !isAdmin && settings?.kitchenDisplayEnabled) {
      actions.push({
        to: "/kitchen",
        label: "Secondary Display",
        icon: ChefHat,
        color: "bg-rose-500/10 text-rose-600 border-rose-200",
        description: "Connect secondary device",
      });
    }

    if (!isWaiter && settings?.taxEnabled) {
      actions.push({
        to: "/admin/settings",
        label: settings.taxLabel || "Tax",
        icon: BarChart3,
        color: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
        description: settings.taxCountry
          ? `${settings.taxDepartment || settings.taxLabel} — ${settings.taxValue}%`
          : `${settings.taxType === "percent" ? `${settings.taxValue}%` : "Fixed"} ${settings.taxLabel || "Tax"}`,
      });
      actions.push({
        to: "/fbr-invoice",
        label: "FBR Invoice",
        icon: FileText,
        color: "bg-red-500/10 text-red-600 border-red-200",
        description: "FBR tax invoices",
      });
    }

    if (isAdmin) {
      actions.push({
        to: "/admin/labels",
        label: "Print Barcodes",
        icon: Tags,
        color: "bg-stone-500/10 text-stone-600 border-stone-200",
        description: "Print product labels",
      });
      actions.push({
        to: "/admin/reports",
        label: "Reports",
        icon: BarChart3,
        color: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
        description: "Sales reports",
      });
      actions.push({
        to: "/admin/settings",
        label: "Settings",
        icon: Settings,
        color: "bg-gray-500/10 text-gray-600 border-gray-200",
        description: "App settings",
      });
      actions.push({
        to: "/admin?tab=cleanup",
        label: "Data Cleanup",
        icon: Trash2,
        color: "bg-red-500/10 text-red-600 border-red-200",
        description: "Clean old data",
      });
    }

    return actions;
  }, [isAdmin, isWaiter, settings]);

  // Clickable stat cards with navigation
  const statCards = React.useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: "Today's Sales",
        value: formatIntMoney(stats.totalSales),
        icon: TrendingUp,
        color: "text-emerald-600",
        bg: "bg-emerald-500/10",
        to: "/admin/reports",
      },
      {
        label: "Orders",
        value: String(stats.totalOrders),
        icon: Receipt,
        color: "text-blue-600",
        bg: "bg-blue-500/10",
        to: "/pos/orders",
      },
      {
        label: "Credit Sales",
        value: formatIntMoney(stats.creditSales),
        icon: CreditCard,
        color: "text-purple-600",
        bg: "bg-purple-500/10",
        to: "/pos/credit-lodge",
      },
      {
        label: "Expenses",
        value: formatIntMoney(stats.totalExpenses),
        icon: TrendingDown,
        color: "text-red-600",
        bg: "bg-red-500/10",
        to: "/pos/expenses",
      },
      {
        label: "Staff Wages",
        value: "",
        icon: Hammer,
        color: "text-amber-600",
        bg: "bg-amber-500/10",
        to: "/pos/expenses",
        hideValue: true,
      },
      {
        label: "Net Revenue",
        value: formatIntMoney(stats.netRevenue),
        icon: DollarSign,
        color: stats.netRevenue >= 0 ? "text-emerald-600" : "text-red-600",
        bg: stats.netRevenue >= 0 ? "bg-emerald-500/10" : "bg-red-500/10",
      },
    ];
  }, [stats]);

  const todayStr = fmtDate(Date.now());

  return (
    <div className="space-y-6 pb-20 pt-2 px-1 overflow-y-auto">
      {/* Welcome header */}
      <div className="flex items-center gap-4">
        <img
          src={appLogo}
          alt="Logo"
          className="h-14 w-14 rounded-xl object-cover shadow-sm border"
        />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">
            Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">Welcome, {session?.username}!</p>
          <p className="text-sm text-muted-foreground">
            {businessName} — {todayStr}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isWorkPeriodActive
                ? "bg-emerald-500/10 text-emerald-700 border border-emerald-200"
                : "bg-muted text-muted-foreground border"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isWorkPeriodActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
              }`}
            />
            {isWorkPeriodActive ? "Shift Active" : "Shift Closed"}
          </span>
        </div>
      </div>

      {/* Stats grid — clickable */}
      {!isWaiter && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {statCards.map((s) => {
            const inner = (
              <Card key={s.label} className={`border shadow-sm ${s.bg} ${s.color} ${s.to ? "cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" : ""}`}>
                <CardContent className="flex items-center gap-3 p-4">
                  <s.icon className="h-6 w-6 shrink-0" />
                  <div className="min-w-0">
                    {!(s as any).hideValue && <p className="font-semibold text-sm truncate">{s.value}</p>}
                    <p className="text-xs opacity-75 truncate">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
            if (s.to) {
              return (
                <div key={s.label} onClick={() => navigate(s.to!)} className="cursor-pointer">
                  {inner}
                </div>
              );
            }
            return <div key={s.label}>{inner}</div>;
          })}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.to} to={action.to}>
              <Card className={`border transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer ${action.color}`}>
                <CardContent className="flex items-center gap-3 p-4">
                  <action.icon className="h-6 w-6 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{action.label}</p>
                    <p className="text-xs opacity-75 truncate">{action.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>


    </div>
  );
}
