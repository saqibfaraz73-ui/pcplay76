import React from "react";
import jsPDF from "jspdf";
import LabourWagesSection from "@/features/pos/LabourWagesSection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { Expense, Settings } from "@/db/schema";
import { EXPENSE_PRESETS } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { useWorkPeriod } from "@/features/pos/WorkPeriodProvider";
import { useAuth } from "@/auth/AuthProvider";
import { makeId } from "@/features/admin/id";
import { formatIntMoney, parseNonDecimalInt, fmtDate, fmtDateTime } from "@/features/pos/format";
import { sharePdfBytes } from "@/features/pos/share-utils";
import { Plus, Trash2, Share2 } from "lucide-react";
import { canMakeSale, incrementSaleCount, type SalesModule } from "@/features/licensing/licensing-db";
import { AdRewardDialog } from "@/features/licensing/AdRewardDialog";

export default function PosExpenses() {
  const { toast } = useToast();
  const { session } = useAuth();
  const { currentWorkPeriod, isWorkPeriodActive } = useWorkPeriod();

  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = React.useState<Expense[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Expense | null>(null);
  const [showLabour, setShowLabour] = React.useState(false);

  // Ad reward dialog
  const [adOpen, setAdOpen] = React.useState(false);
  const [adMsg, setAdMsg] = React.useState("");
  const [pendingSave, setPendingSave] = React.useState(false);

  // Form state
  const [expenseName, setExpenseName] = React.useState("");
  const [customName, setCustomName] = React.useState("");
  const [amount, setAmount] = React.useState(0);
  const [note, setNote] = React.useState("");

  // Date filter for PDF
  const now = Date.now();
  const toDateVal = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [filterFrom, setFilterFrom] = React.useState(toDateVal(now));
  const [filterTo, setFilterTo] = React.useState(toDateVal(now));

  const refresh = React.useCallback(async () => {
    const all = await db.expenses.orderBy("createdAt").reverse().toArray();
    const s = await db.settings.get("app");
    setAllExpenses(all);
    setSettings(s ?? null);

    // Filter expenses to current work period if active, otherwise today
    if (currentWorkPeriod && !currentWorkPeriod.isClosed) {
      const wpStart = currentWorkPeriod.startedAt;
      const wpEnd = currentWorkPeriod.endedAt ?? Date.now();
      setExpenses(all.filter((e) => e.createdAt >= wpStart && e.createdAt <= wpEnd));
    } else {
      // Show today's expenses when no work period active
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      setExpenses(all.filter((e) => e.createdAt >= todayStart.getTime()));
    }
  }, [currentWorkPeriod]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const periodTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const periodLabel = currentWorkPeriod && !currentWorkPeriod.isClosed
    ? "Current Work Period Expenses"
    : "Today's Expenses";

  const filteredExpenses = React.useMemo(() => {
    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd, 0, 0, 0, 0).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();
    return allExpenses.filter((e) => e.createdAt >= fromTs && e.createdAt <= toTs);
  }, [allExpenses, filterFrom, filterTo]);

  const filteredTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const buildExpensesPdf = (list: Expense[], fromLabel: string, toLabel: string) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40;
    const right = pageW - 40;
    let y = 48;
    const lineH = 14;
    const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };

    const restaurantName = settings?.restaurantName ?? "SANGI POS";

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Expenses Report", left, y);
    y += 20;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${fromLabel} → ${toLabel}`, left, y);
    y += 20;

    // Summary
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Expenses: ${formatIntMoney(list.reduce((s, e) => s + e.amount, 0))}`, left, y);
    y += 8;
    doc.text(`Count: ${list.length}`, left, y);
    y += 20;

    // Table header
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("#", left + 4, y);
    doc.text("Expense", left + 30, y);
    doc.text("Amount", right - 100, y);
    doc.text("Date", right - 30, y, { align: "right" });
    y += 10;
    doc.setDrawColor(200);
    doc.line(left, y - 4, right, y - 4);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    list.forEach((e, idx) => {
      checkPage();
      doc.setFontSize(9);
      doc.text(String(idx + 1), left + 4, y);
      const label = e.note ? `${e.name} (${e.note})` : e.name;
      doc.text(label.slice(0, 40), left + 30, y);
      doc.text(formatIntMoney(e.amount), right - 100, y);
      doc.text(fmtDate(e.createdAt), right - 30, y, { align: "right" });
      y += lineH;
    });

    return doc;
  };

  const shareExpensesPdf = async () => {
    try {
      const list = filteredExpenses;
      if (list.length === 0) {
        toast({ title: "No expenses in this date range", variant: "destructive" });
        return;
      }
      const doc = buildExpensesPdf(list, filterFrom, filterTo);
      const bytes = doc.output("arraybuffer");
      const fileName = `expenses_${filterFrom}_${filterTo}.pdf`;

      await sharePdfBytes(new Uint8Array(bytes), fileName, "Expenses Report");
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const openAddDialog = () => {
    setExpenseName("");
    setCustomName("");
    setAmount(0);
    setNote("");
    setAddOpen(true);
  };

  const resolvedName = expenseName === "__custom" ? customName.trim() : expenseName;

  const saveExpense = async () => {
    try {
      const name = resolvedName;
      if (!name) throw new Error("Expense name is required.");
      if (amount <= 0) throw new Error("Amount must be greater than 0.");

      // License check
      const check = await canMakeSale("expenses");
      if (!check.allowed) {
        setAdMsg(check.message);
        setPendingSave(true);
        setAdOpen(true);
        return;
      }

      const expense: Expense = {
        id: makeId("exp"),
        name,
        amount,
        note: note.trim() || undefined,
        workPeriodId: currentWorkPeriod?.id,
        createdAt: Date.now(),
      };
      await db.expenses.put(expense);
      await incrementSaleCount("expenses");
      toast({ title: "Expense added", description: `${name} — ${formatIntMoney(amount)}` });
      setAddOpen(false);
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await db.expenses.delete(deleteTarget.id);
    toast({ title: "Expense deleted" });
    setDeleteTarget(null);
    await refresh();
  };

  if (showLabour) {
    return <LabourWagesSection workPeriodId={currentWorkPeriod?.id} onBack={() => setShowLabour(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">Cashier: {session?.username}</p>
        </div>
        <Button onClick={openAddDialog} disabled={!isWorkPeriodActive}>
          <Plus className="h-4 w-4 mr-1" />
          Add Expense
        </Button>
      </div>

      {!isWorkPeriodActive && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-50 dark:bg-orange-950/20 p-3">
          <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
            Start a work period to add expenses
          </span>
        </div>
      )}

      {/* Period summary */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">{periodLabel}</CardTitle>
          <CardDescription>{expenses.length} expenses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">{formatIntMoney(periodTotal)}</div>
        </CardContent>
      </Card>

      {/* Share PDF section */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Share Expenses PDF</CardTitle>
          <CardDescription>Export expenses for a date range as PDF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="expFrom" className="text-xs">From</Label>
              <Input id="expFrom" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expTo" className="text-xs">To</Label>
              <Input id="expTo" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{filteredExpenses.length} expenses • {formatIntMoney(filteredTotal)}</span>
            <Button variant="outline" size="sm" onClick={() => void shareExpensesPdf()} disabled={filteredExpenses.length === 0}>
              <Share2 className="h-4 w-4 mr-1" />
              Share PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Expense list */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">{periodLabel} List</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {expenses.length === 0 ? (
            <div className="text-sm text-muted-foreground">No expenses recorded yet.</div>
          ) : (
            expenses.map((e, idx) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">{expenses.length - idx}</span>
                    <span className="text-sm font-medium truncate">{e.name}</span>
                  </div>
                  {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {fmtDateTime(e.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-destructive">{formatIntMoney(e.amount)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(e)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Expense Type</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {EXPENSE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      if (preset === "Staff/Wages") {
                        setAddOpen(false);
                        setShowLabour(true);
                        return;
                      }
                      setExpenseName(preset);
                    }}
                    className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                      expenseName === preset
                        ? "border-primary bg-primary/10 font-medium"
                        : "hover:bg-accent"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setExpenseName("__custom")}
                  className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                    expenseName === "__custom"
                      ? "border-primary bg-primary/10 font-medium"
                      : "hover:bg-accent"
                  }`}
                >
                  Other (custom)
                </button>
              </div>
            </div>

            {expenseName === "__custom" && (
              <div className="space-y-2">
                <Label htmlFor="customExpenseName">Custom Expense Name</Label>
                <Input
                  id="customExpenseName"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g., Bought printer ink"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="expenseAmount">Amount</Label>
              <Input
                id="expenseAmount"
                inputMode="numeric"
                value={amount === 0 ? "" : String(amount)}
                onChange={(e) => setAmount(parseNonDecimalInt(e.target.value))}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expenseNote">Note (optional)</Label>
              <Input
                id="expenseNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g., Office supplies from store"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveExpense()} disabled={!resolvedName || amount <= 0}>
              Save Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{deleteTarget?.name}" — {deleteTarget ? formatIntMoney(deleteTarget.amount) : ""}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AdRewardDialog
        open={adOpen}
        onOpenChange={(v) => { setAdOpen(v); if (!v) setPendingSave(false); }}
        module="expenses"
        message={adMsg}
        onRewarded={() => { if (pendingSave) void saveExpense(); }}
      />
    </div>
  );
}
