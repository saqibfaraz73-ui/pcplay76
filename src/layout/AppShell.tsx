import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { Menu, Printer, BarChart3, Settings, ShoppingCart, ClipboardList, Users, DollarSign, Truck, UtensilsCrossed, CalendarCheck, Wifi, Shield, Home, Info, HelpCircle, Tags, FileText, WifiOff, AlertTriangle, ChefHat, CreditCard } from "lucide-react";
import { useAndroidBackExitConfirm } from "@/hooks/useAndroidBackExitConfirm";
import appLogo from "@/assets/app-logo.jpg";
import { db } from "@/db/appDb";
import { BackupReminder } from "@/features/admin/backup/BackupReminder";
import { SyncStatusIndicator } from "@/features/sync/SyncStatusIndicator";
import { showInterstitialAd } from "@/features/licensing/admob-ads";
import { getLicense, getOnlineCheckStatus } from "@/features/licensing/licensing-db";

const navItems = [
  { to: "/home", label: "Dashboard", icon: Home },
  { to: "/pos", label: "Sales", icon: ShoppingCart, salesOnly: true },
  { to: "/pos/tables", label: "Tables", icon: UtensilsCrossed, tablesOnly: true },
  { to: "/admin", label: "Admin", icon: ClipboardList, adminOnly: true },
];

const adminSubNav = [
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/labels", label: "Print Barcodes", icon: Tags },
  { to: "/admin/printer", label: "Printer", icon: Printer },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [tableManagementEnabled, setTableManagementEnabled] = React.useState(false);
  const [advanceBookingEnabled, setAdvanceBookingEnabled] = React.useState(false);
  const [syncEnabled, setSyncEnabled] = React.useState(false);
  const [cashierReportsEnabled, setCashierReportsEnabled] = React.useState(false);
  const [supervisorPrinterEnabled, setSupervisorPrinterEnabled] = React.useState(false);
  const [waiterPrinterEnabled, setWaiterPrinterEnabled] = React.useState(false);
  const [recoveryPrinterEnabled, setRecoveryPrinterEnabled] = React.useState(false);
  const [salesDashboardEnabled, setSalesDashboardEnabled] = React.useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = React.useState(false);
  const [recoveryEnabled, setRecoveryEnabled] = React.useState(false);
  const [kitchenDisplayEnabled, setKitchenDisplayEnabled] = React.useState(false);
  const [installmentEnabled, setInstallmentEnabled] = React.useState(false);
  const [pendingTableCount, setPendingTableCount] = React.useState(0);
  const [isPremium, setIsPremium] = React.useState(false);
  const [onlineWarningHours, setOnlineWarningHours] = React.useState<number | null>(null);

  const loadTableSetting = React.useCallback(async () => {
    const s = await db.settings.get("app");
    setTableManagementEnabled(!!s?.tableManagementEnabled);
    setAdvanceBookingEnabled(!!s?.advanceBookingEnabled);
    setSyncEnabled(!!s?.syncEnabled);
    setCashierReportsEnabled(!!s?.cashierReportsEnabled);
    setSupervisorPrinterEnabled(!!s?.supervisorPrinterEnabled);
    setWaiterPrinterEnabled(!!s?.waiterPrinterEnabled);
    setRecoveryPrinterEnabled(!!s?.recoveryPrinterEnabled);
    setSalesDashboardEnabled(s?.salesDashboardEnabled !== false);
    setDeliveryEnabled(!!s?.deliveryEnabled);
    setRecoveryEnabled(!!s?.recoveryEnabled);
    setKitchenDisplayEnabled(!!s?.kitchenDisplayEnabled);
    setInstallmentEnabled(!!s?.installmentEnabled);
    // Count open (pending) table orders
    const openCount = await db.tableOrders.where("status").equals("open").count();
    setPendingTableCount(openCount);
    // Check premium status + online warning
    getLicense().then((lic) => setIsPremium(lic.isPremium)).catch(() => {});
    getOnlineCheckStatus().then(({ status, hoursRemaining }) => {
      setOnlineWarningHours(status === "warning" ? hoursRemaining : null);
    }).catch(() => {});
  }, []);

  // Also reload when route changes (e.g. navigating away from settings)
  React.useEffect(() => { loadTableSetting(); }, [location.pathname, loadTableSetting]);

  // Show interstitial ad on section change (free users only)
  const prevPathRef = React.useRef(location.pathname);
  React.useEffect(() => {
    const prev = prevPathRef.current;
    const curr = location.pathname;
    // Only fire when the top-level section changes (e.g. /pos → /admin)
    const prevSection = prev.split("/")[1];
    const currSection = curr.split("/")[1];
    // Never show ads on auth/public pages
    const noAdPages = ["login", "super-admin", "privacy-policy", "about", "help", ""];
    if (
      prevSection !== currSection &&
      currSection &&
      !noAdPages.includes(currSection) &&
      !noAdPages.includes(prevSection)
    ) {
      getLicense().then((lic) => {
        if (!lic.isPremium) void showInterstitialAd();
      }).catch(() => {});
    }
    prevPathRef.current = curr;
  }, [location.pathname]);

  // Re-check when user navigates back, app regains focus, or settings change
  React.useEffect(() => {
    const refresh = () => void loadTableSetting();
    window.addEventListener("focus", refresh);
    window.addEventListener("sangi-settings-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("sangi-settings-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadTableSetting]);

  const { exitConfirmOpen, cancelExit, confirmExit } = useAndroidBackExitConfirm({
    confirmOnPaths: ["/pos", "/login"],
    onNavigateBack: () => navigate(-1),
  });

  const isAdmin = session?.role === "admin";
  const isCashier = session?.role === "cashier";
  const isWaiter = session?.role === "waiter" || session?.role === "supervisor";
  const isSupervisor = session?.role === "supervisor";
  const isRecoveryAgent = session?.role === "recovery";
  const isInstallmentAgent = session?.role === "installment_agent";

  const visibleNavItems = React.useMemo(() => {
    if (isWaiter || isRecoveryAgent || isInstallmentAgent) return [];
    return navItems.filter((n) => {
      if (n.adminOnly && !isAdmin) return false;
      if ((n as any).salesOnly && !salesDashboardEnabled) return false;
      if ((n as any).tablesOnly && !tableManagementEnabled) return false;
      return true;
    });
  }, [isAdmin, isWaiter, isRecoveryAgent, isInstallmentAgent, salesDashboardEnabled]);

  const visibleAdminSubNav = React.useMemo(() => {
    return adminSubNav;
  }, []);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-[env(safe-area-inset-top)]" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
          {session ? (
            <>
              {/* Left: navigation + logout */}
              <div className="flex items-center gap-3">
                {/* Mobile nav */}
                <div className="md:hidden">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="icon" aria-label="Open navigation">
                        <Menu className="h-4 w-4" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-72 flex flex-col">
                      <SheetHeader>
                        <SheetTitle>Menu</SheetTitle>
                      </SheetHeader>
                      <div className="mt-4 flex flex-col flex-1 min-h-0">
                        <nav className="grid gap-1 flex-1 overflow-y-auto pb-2">
                          {/* Dashboard link for waiter/agent who have no main nav */}
                          {(isWaiter || isRecoveryAgent || isInstallmentAgent) && (
                            <Link
                              to={isRecoveryAgent ? "/recovery" : isInstallmentAgent ? "/installments" : isWaiter ? "/pos/tables" : "/home"}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                isActive(isRecoveryAgent ? "/recovery" : isInstallmentAgent ? "/installments" : isWaiter ? "/pos/tables" : "/home")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <Home className="h-4 w-4" />
                              Dashboard
                            </Link>
                          )}
                          {visibleNavItems.map((n) => {
                            const Icon = n.icon;
                            return (
                              <Link
                                key={n.to}
                                to={n.to}
                                className={cn(
                                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                  isActive(n.to) && !adminSubNav.some((s) => isActive(s.to))
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                              >
                                <Icon className="h-4 w-4" />
                                {n.label}
                              </Link>
                            );
                          })}
                          {!isWaiter && !isRecoveryAgent && !isInstallmentAgent && (
                            <Link to="/pos/orders" className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/orders") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                              <ClipboardList className="h-4 w-4" /> Orders
                            </Link>
                          )}

                          {installmentEnabled && (isAdmin || isCashier) && (
                            <Link
                              to="/installments"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                isActive("/installments")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <CreditCard className="h-4 w-4" />
                              Installment
                            </Link>
                          )}

                          {/* Reports link for cashier when enabled */}
                          {isCashier && cashierReportsEnabled && (
                            <Link
                              to="/admin/reports"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                isActive("/admin/reports")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <BarChart3 className="h-4 w-4" />
                              Reports
                            </Link>
                          )}

                          {/* Printer link for cashier/supervisor (when enabled) */}
                          {(isCashier || (isSupervisor && supervisorPrinterEnabled) || (isWaiter && waiterPrinterEnabled) || (isRecoveryAgent && recoveryPrinterEnabled)) && (
                            <Link
                              to="/admin/printer"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                isActive("/admin/printer")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <Printer className="h-4 w-4" />
                              Printer
                            </Link>
                          )}


                          {/* Admin sub-navigation */}
                          {isAdmin ? (
                            <>
                              <div className="mt-3 mb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Admin Tools
                              </div>
                              {visibleAdminSubNav.map((n) => {
                                const Icon = n.icon;
                                return (
                                  <Link
                                    key={n.to}
                                    to={n.to}
                                    className={cn(
                                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                      isActive(n.to)
                                        ? "bg-accent text-accent-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    <Icon className="h-4 w-4" />
                                    {n.label}
                                  </Link>
                                );
                              })}
                              {kitchenDisplayEnabled && (
                                <Link
                                  to="/admin/kitchen"
                                  className={cn(
                                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                    isActive("/admin/kitchen")
                                      ? "bg-accent text-accent-foreground"
                                      : "text-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  <ChefHat className="h-4 w-4" />
                                  Kitchen Status
                                </Link>
                              )}
                            </>
                          ) : null}

                          <div className="mt-3 mb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            More
                          </div>
                          <Link to="/about" className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", isActive("/about") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                            <Info className="h-4 w-4" /> About App
                          </Link>
                          <Link to="/help" className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", isActive("/help") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                            <HelpCircle className="h-4 w-4" /> Help
                          </Link>
                        </nav>
                        <div className="shrink-0 space-y-3 pt-3 border-t">
                          <div className="rounded-md border bg-muted/20 p-3 text-sm">
                            <div className="text-xs text-muted-foreground">Logged in</div>
                            <div className="font-medium">
                              {session.username} ({session.role})
                            </div>
                          </div>
                          <Button variant="outline" onClick={logout} className="w-full">
                            Logout
                          </Button>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>

                <nav className="hidden items-center gap-2 md:flex">
                  {/* Dashboard link for waiter/agent */}
                  {(isWaiter || isRecoveryAgent || isInstallmentAgent) && (
                    <Link
                      to={isRecoveryAgent ? "/recovery" : isInstallmentAgent ? "/installments" : isWaiter ? "/pos/tables" : "/home"}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm transition-colors",
                        isActive(isRecoveryAgent ? "/recovery" : isInstallmentAgent ? "/installments" : isWaiter ? "/pos/tables" : "/home")
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Dashboard
                    </Link>
                  )}
                  {visibleNavItems.map((n) => (
                    <Link
                      key={n.to}
                      to={n.to}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm transition-colors",
                        isActive(n.to) && !adminSubNav.some((s) => isActive(s.to))
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {n.label}
                    </Link>
                  ))}
                   {!isWaiter && !isRecoveryAgent && !isInstallmentAgent && (
                    <Link to="/pos/orders" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/orders") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                      Orders
                    </Link>
                  )}
                  {installmentEnabled && (isAdmin || isCashier) && (
                    <Link to="/installments" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/installments") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                      Installment
                    </Link>
                  )}
                  {isCashier && cashierReportsEnabled && (
                    <Link to="/admin/reports" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/admin/reports") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                      Reports
                    </Link>
                  )}
                  {(isCashier || (isSupervisor && supervisorPrinterEnabled) || (isWaiter && waiterPrinterEnabled) || (isRecoveryAgent && recoveryPrinterEnabled)) && (
                    <Link
                      to="/admin/printer"
                      className={cn(
                        "rounded-md px-3 py-2 text-sm transition-colors",
                        isActive("/admin/printer")
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Printer
                    </Link>
                  )}
                  {isAdmin
                    ? visibleAdminSubNav.map((n) => (
                        <Link
                          key={n.to}
                          to={n.to}
                          className={cn(
                            "rounded-md px-3 py-2 text-sm transition-colors",
                            isActive(n.to)
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {n.label}
                        </Link>
                      ))
                    : null}
                  <Link to="/about" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/about") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                    About
                  </Link>
                  <Link to="/help" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/help") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                    Help
                  </Link>
                </nav>

                <div className="hidden md:block">
                  <Button variant="outline" onClick={logout}>
                    Logout
                  </Button>
                </div>
              </div>

              {/* Right: branding + sync indicator */}
              <div className="flex items-center gap-3">
                <SyncStatusIndicator />
                <div className="text-right">
                  <div className="text-sm font-semibold leading-tight">
                    {isPremium ? "SANGI POS Pro" : "SANGI POS"}
                  </div>
                  <div className="text-xs text-muted-foreground leading-tight">All-in-One Offline POS</div>
                </div>
                <div className="h-9 w-9 overflow-hidden rounded-md border bg-muted">
                  <img src={appLogo} alt="SANGI POS logo" className="h-full w-full object-cover" loading="eager" />
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Offline mode</div>
          )}
        </div>
      </header>

      {/* Online verification warning banner */}
      {onlineWarningHours !== null && (
        <div className="mx-auto max-w-6xl px-4 mt-16" style={{ marginTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
          <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <strong>Internet verification needed!</strong> Please connect to the internet within{" "}
              <strong>{onlineWarningHours} hour{onlineWarningHours !== 1 ? "s" : ""}</strong> to verify your subscription. The app will be paused after this time.
            </span>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={cn("mx-auto max-w-6xl px-4 py-6 overflow-x-hidden", onlineWarningHours !== null ? "mt-4" : "mt-16")} style={onlineWarningHours !== null ? { paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' } : { marginTop: 'calc(4rem + env(safe-area-inset-top, 0px))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>{children}</main>

      <BackupReminder />

      <AlertDialog open={exitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close app?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to close SANGI POS?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelExit}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExit}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
