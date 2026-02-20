import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { db } from "@/db/appDb";
import { AdminPrinter } from "@/features/admin/printer/AdminPrinter";

export default function AdminPrinterPage() {
  const { session } = useAuth();
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const role = session?.role;
    // Admin and cashier always have access
    if (role === "admin" || role === "cashier") {
      setAllowed(true);
      return;
    }
    // Other roles need their setting enabled
    db.settings.get("app").then((s) => {
      if (role === "supervisor" && s?.supervisorPrinterEnabled) setAllowed(true);
      else if (role === "waiter" && s?.waiterPrinterEnabled) setAllowed(true);
      else if (role === "recovery" && s?.recoveryPrinterEnabled) setAllowed(true);
      else setAllowed(false);
    });
  }, [session]);

  if (allowed === null) return null; // loading
  if (!allowed) {
    const fallback = session?.role === "recovery" ? "/recovery"
      : session?.role === "waiter" || session?.role === "supervisor" ? "/pos/tables"
      : "/home";
    return <Navigate to={fallback} replace />;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Printer Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your thermal printer connection and receipt settings.</p>
      </header>
      <AdminPrinter />
    </div>
  );
}
