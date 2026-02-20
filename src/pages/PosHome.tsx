import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/db/appDb";
import { useAuth } from "@/auth/AuthProvider";
import { useWorkPeriod } from "@/features/pos/WorkPeriodProvider";
import { formatIntMoney, fmtDate, fmtTime12 } from "@/features/pos/format";
import { isSameLocalDay } from "@/features/pos/time";
import type { Order, Expense } from "@/db/schema";
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
} from "lucide-react";
import appLogo from "@/assets/app-logo.jpg";

type TodayStats = {
  totalSales: number;
  totalOrders: number;
  cashSales: number;
  creditSales: number;
  deliverySales: number;
  totalExpenses: number;
  netRevenue: number;
  recentOrders: Order[];
};

export default function PosHome() {
  const { session } = useAuth();
  const { isWorkPeriodActive } = useWorkPeriod();
  const [stats, setStats] = React.useState<TodayStats | null>(null);
  const [settings, setSettings] = React.useState<{ tableManagementEnabled?: boolean; advanceBookingEnabled?: boolean; deliveryEnabled?: boolean; recoveryEnabled?: boolean; syncEnabled?: boolean; businessName?: string } | null>(null);

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

    const cashSales = todayOrders
      .filter((o) => o.paymentMethod === "cash")
      .reduce((s, o) => s + o.total, 0);
    const creditSales = todayOrders
      .filter((o) => o.paymentMethod === "credit")
      .reduce((s, o) => s + o.total, 0);
    const deliverySales = todayOrders
      .filter((o) => o.paymentMethod === "delivery")
      .reduce((s, o) => s + o.total, 0);
    const totalSales = cashSales + creditSales + deliverySales;

    const allExpenses = await db.expenses.toArray();
    const todayExpenses = allExpenses.filter((e) => isSameLocalDay(e.createdAt, now));
    const totalExpenses = todayExpenses.reduce((s, e) => s + e.amount, 0);

    setStats({
      totalSales,
      totalOrders: todayOrders.length,
      cashSales,
      creditSales,
      deliverySales,
      totalExpenses,
      netRevenue: totalSales - totalExpenses,
      recentOrders: todayOrders.slice(-5).reverse(),
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

    if (isAdmin) {
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
    }

    return actions;
  }, [isAdmin, isWaiter, settings]);

  const statCards = React.useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: "Today's Sales",
        value: formatIntMoney(stats.totalSales),
        icon: TrendingUp,
        color: "text-emerald-600",
        bg: "bg-emerald-500/10",
      },
      {
        label: "Orders",
        value: String(stats.totalOrders),
        icon: Receipt,
        color: "text-blue-600",
        bg: "bg-blue-500/10",
      },
      {
        label: "Cash Sales",
        value: formatIntMoney(stats.cashSales),
        icon: Banknote,
        color: "text-green-600",
        bg: "bg-green-500/10",
      },
      {
        label: "Credit Sales",
        value: formatIntMoney(stats.creditSales),
        icon: CreditCard,
        color: "text-purple-600",
        bg: "bg-purple-500/10",
      },
      {
        label: "Expenses",
        value: formatIntMoney(stats.totalExpenses),
        icon: TrendingDown,
        color: "text-red-600",
        bg: "bg-red-500/10",
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

      {/* Stats grid */}
      {!isWaiter && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((s) => (
            <Card key={s.label} className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`rounded-lg p-1.5 ${s.bg}`}>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                </div>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
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

      {/* Recent orders */}
      {!isWaiter && stats && stats.recentOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Recent Orders
            </h2>
            <Link to="/pos/orders">
              <Button variant="ghost" size="sm" className="text-xs">
                View All →
              </Button>
            </Link>
          </div>
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="divide-y">
                {stats.recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-lg bg-muted p-2">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          #{order.receiptNo}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {order.lines.length} item{order.lines.length > 1 ? "s" : ""} •{" "}
                          {order.paymentMethod}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">{formatIntMoney(order.total)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
