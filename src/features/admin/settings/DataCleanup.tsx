import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { db } from "@/db/appDb";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

type Section =
  | "sales"
  | "tables"
  | "advance"
  | "expenses"
  | "recovery"
  | "suppliers"
  | "exportParty"
  | "creditPayments";

const SECTIONS: { id: Section; label: string; description: string }[] = [
  { id: "sales", label: "Sales / Orders", description: "Orders, work periods" },
  { id: "tables", label: "Table Management", description: "Table orders" },
  { id: "advance", label: "Advance / Booking", description: "Advance orders, booking orders" },
  { id: "expenses", label: "Expenses", description: "Expense records" },
  { id: "recovery", label: "Recovery", description: "Recovery payments" },
  { id: "suppliers", label: "Party Lodge (Suppliers)", description: "Supplier arrivals, payments" },
  { id: "exportParty", label: "Export Party", description: "Export sales, payments" },
  { id: "creditPayments", label: "Credit Payments", description: "Customer credit payments" },
];

export function DataCleanup() {
  const { toast } = useToast();
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [selected, setSelected] = React.useState<Set<Section>>(new Set());
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deletedCounts, setDeletedCounts] = React.useState<Record<string, number> | null>(null);

  const toggle = (s: Section) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const canDelete = fromDate && toDate && selected.size > 0 && new Date(fromDate) <= new Date(toDate);

  const handleDelete = async () => {
    setShowConfirm(false);
    setDeleting(true);
    const from = new Date(fromDate).setHours(0, 0, 0, 0);
    const to = new Date(toDate).setHours(23, 59, 59, 999);
    const counts: Record<string, number> = {};

    try {
      if (selected.has("sales")) {
        const orders = await db.orders.where("createdAt").between(from, to, true, true).toArray();
        const wpIds = new Set(orders.map((o) => o.workPeriodId).filter(Boolean));
        await db.orders.where("createdAt").between(from, to, true, true).delete();
        counts["Orders"] = orders.length;
        // Delete work periods that fall in range
        const wps = await db.workPeriods.where("startedAt").between(from, to, true, true).toArray();
        await db.workPeriods.bulkDelete(wps.map((w) => w.id));
        counts["Work Periods"] = wps.length;
      }

      if (selected.has("tables")) {
        const tOrders = await db.tableOrders.where("createdAt").between(from, to, true, true).toArray();
        await db.tableOrders.bulkDelete(tOrders.map((t) => t.id));
        counts["Table Orders"] = tOrders.length;
      }

      if (selected.has("advance")) {
        const adv = await db.advanceOrders.where("createdAt").between(from, to, true, true).toArray();
        await db.advanceOrders.bulkDelete(adv.map((a) => a.id));
        counts["Advance Orders"] = adv.length;
        const bk = await db.bookingOrders.where("createdAt").between(from, to, true, true).toArray();
        await db.bookingOrders.bulkDelete(bk.map((b) => b.id));
        counts["Booking Orders"] = bk.length;
      }

      if (selected.has("expenses")) {
        const exp = await db.expenses.where("createdAt").between(from, to, true, true).toArray();
        await db.expenses.bulkDelete(exp.map((e) => e.id));
        counts["Expenses"] = exp.length;
      }

      if (selected.has("recovery")) {
        const rp = await db.recoveryPayments.where("createdAt").between(from, to, true, true).toArray();
        await db.recoveryPayments.bulkDelete(rp.map((r) => r.id));
        counts["Recovery Payments"] = rp.length;
      }

      if (selected.has("suppliers")) {
        const sa = await db.supplierArrivals.where("createdAt").between(from, to, true, true).toArray();
        await db.supplierArrivals.bulkDelete(sa.map((a) => a.id));
        counts["Supplier Arrivals"] = sa.length;
        const sp = await db.supplierPayments.where("createdAt").between(from, to, true, true).toArray();
        await db.supplierPayments.bulkDelete(sp.map((p) => p.id));
        counts["Supplier Payments"] = sp.length;
      }

      if (selected.has("exportParty")) {
        const es = await db.exportSales.where("createdAt").between(from, to, true, true).toArray();
        await db.exportSales.bulkDelete(es.map((s) => s.id));
        counts["Export Sales"] = es.length;
        const ep = await db.exportPayments.where("createdAt").between(from, to, true, true).toArray();
        await db.exportPayments.bulkDelete(ep.map((p) => p.id));
        counts["Export Payments"] = ep.length;
      }

      if (selected.has("creditPayments")) {
        const cp = await db.creditPayments.where("createdAt").between(from, to, true, true).toArray();
        await db.creditPayments.bulkDelete(cp.map((p) => p.id));
        counts["Credit Payments"] = cp.length;
      }

      setDeletedCounts(counts);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast({ title: `Deleted ${total} records`, description: "Old data has been removed." });
      setSelected(new Set());
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (d: string) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Data Cleanup
          </CardTitle>
          <CardDescription>
            Permanently delete old data by date range to keep the app clean and fast. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date range */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cleanup-from">From date</Label>
              <Input id="cleanup-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleanup-to">To date</Label>
              <Input id="cleanup-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>

          {/* Section selector */}
          <div className="space-y-2">
            <Label>Select sections to clean</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {SECTIONS.map((s) => (
                <label
                  key={s.id}
                  className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={() => toggle(s.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Delete summary */}
          {deletedCounts && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div className="font-medium text-destructive">Last cleanup result:</div>
              {Object.entries(deletedCounts).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="destructive"
              disabled={!canDelete || deleting}
              onClick={() => setShowConfirm(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting..." : "Delete Selected Data"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Permanently delete data?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will permanently delete all records from{" "}
                <strong>{formatDate(fromDate)}</strong> to{" "}
                <strong>{formatDate(toDate)}</strong> in the following sections:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {Array.from(selected).map((s) => {
                  const sec = SECTIONS.find((x) => x.id === s);
                  return <li key={s}>{sec?.label ?? s}</li>;
                })}
              </ul>
              <p className="text-destructive font-medium">This action cannot be undone!</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
