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
import { Menu, Printer, BarChart3, Settings, ShoppingCart, ClipboardList, Users, DollarSign, Truck, UtensilsCrossed, CalendarCheck, Wifi } from "lucide-react";
import { useAndroidBackExitConfirm } from "@/hooks/useAndroidBackExitConfirm";
import appLogo from "@/assets/app-logo.jpg";
import { db } from "@/db/appDb";
import { BackupReminder } from "@/features/admin/backup/BackupReminder";
import { SyncStatusIndicator } from "@/features/sync/SyncStatusIndicator";

const navItems = [
  { to: "/pos", label: "Sales", icon: ShoppingCart },
  { to: "/admin", label: "Admin", icon: ClipboardList, adminOnly: true },
];

const adminSubNav = [
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/delivery", label: "Delivery", icon: Truck },
  { to: "/admin/sync", label: "Sync", icon: Wifi },
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

  const loadTableSetting = React.useCallback(async () => {
    const s = await db.settings.get("app");
    setTableManagementEnabled(!!s?.tableManagementEnabled);
    setAdvanceBookingEnabled(!!s?.advanceBookingEnabled);
    setSyncEnabled(!!s?.syncEnabled);
  }, []);

  // Also reload when route changes (e.g. navigating away from settings)
  React.useEffect(() => { loadTableSetting(); }, [location.pathname, loadTableSetting]);

  // Re-check when user navigates back or app regains focus
  React.useEffect(() => {
    const refresh = () => void loadTableSetting();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadTableSetting]);

  const { exitConfirmOpen, cancelExit, confirmExit } = useAndroidBackExitConfirm({
    confirmOnPaths: ["/pos", "/login"],
    onNavigateBack: () => navigate(-1),
  });

  const isAdmin = session?.role === "admin";
  const isWaiter = session?.role === "waiter";

  const visibleNavItems = React.useMemo(() => {
    if (isWaiter) return [];
    return navItems.filter((n) => (isAdmin ? true : !n.adminOnly));
  }, [isAdmin, isWaiter]);

  const visibleAdminSubNav = React.useMemo(() => {
    return adminSubNav.filter((n) => {
      if (n.to === "/admin/sync" && !syncEnabled) return false;
      return true;
    });
  }, [syncEnabled]);

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
                    <SheetContent side="left" className="w-72">
                      <SheetHeader>
                        <SheetTitle>Menu</SheetTitle>
                      </SheetHeader>
                      <div className="mt-4 space-y-4">
                        <nav className="grid gap-1">
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
                          {!isWaiter && (
                            <>
                              <Link to="/pos/orders" className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/orders") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <ClipboardList className="h-4 w-4" /> Orders
                              </Link>
                              <Link to="/pos/expenses" className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/expenses") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <DollarSign className="h-4 w-4" /> Expenses
                              </Link>
                              <Link to="/pos/credit-lodge" className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/credit-lodge") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <Users className="h-4 w-4" /> Credit Lodge
                              </Link>
                              <Link to="/pos/party-lodge" className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/party-lodge") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <Truck className="h-4 w-4" /> Party Lodge
                              </Link>
                            </>
                          )}
                          {(tableManagementEnabled || isWaiter) && (
                            <Link to="/pos/tables" className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/tables") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                              <UtensilsCrossed className="h-4 w-4" /> Tables
                            </Link>
                          )}
                          {advanceBookingEnabled && !isWaiter && (
                            <Link to="/pos/advance-booking" className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/advance-booking") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                              <CalendarCheck className="h-4 w-4" /> Advance/Booking
                            </Link>
                          )}

                          {/* Printer link for all roles */}
                          {!isAdmin && (
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
                            </>
                          ) : null}
                        </nav>

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
                    </SheetContent>
                  </Sheet>
                </div>

                <nav className="hidden items-center gap-2 md:flex">
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
                  {!isWaiter && (
                    <>
                      <Link to="/pos/orders" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/orders") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                        Orders
                      </Link>
                      <Link to="/pos/expenses" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/expenses") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                        Expenses
                      </Link>
                      <Link to="/pos/credit-lodge" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/credit-lodge") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                        Credit Lodge
                      </Link>
                      <Link to="/pos/party-lodge" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/party-lodge") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                        Party Lodge
                      </Link>
                    </>
                  )}
                  {(tableManagementEnabled || isWaiter) && (
                    <Link to="/pos/tables" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/tables") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                      Tables
                    </Link>
                  )}
                  {advanceBookingEnabled && !isWaiter && (
                    <Link to="/pos/advance-booking" className={cn("rounded-md px-3 py-2 text-sm transition-colors", isActive("/pos/advance-booking") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                      Advance/Booking
                    </Link>
                  )}
                  {!isAdmin && (
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
                  <div className="text-sm font-semibold leading-tight">SANGI POS</div>
                  <div className="text-xs text-muted-foreground leading-tight">Offline POS</div>
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

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-4 py-6 mt-16 overflow-x-hidden" style={{ marginTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>{children}</main>

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
