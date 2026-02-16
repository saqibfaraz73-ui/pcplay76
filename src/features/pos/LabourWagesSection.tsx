import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { Labour, LabourTransaction, LabourTransactionType, WagePeriod } from "@/db/schema";
import { WAGE_PERIODS } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";
import { formatIntMoney, parseNonDecimalInt } from "@/features/pos/format";
import { Plus, Trash2, ArrowLeft, Wallet, ArrowDownCircle, ArrowUpCircle, MinusCircle, PlusCircle, Share2 } from "lucide-react";
import { jsPDF } from "jspdf";

interface Props {
  workPeriodId?: string;
  onBack: () => void;
}

export default function LabourWagesSection({ workPeriodId, onBack }: Props) {
  const { toast } = useToast();
  const [labours, setLabours] = React.useState<Labour[]>([]);
  const [transactions, setTransactions] = React.useState<LabourTransaction[]>([]);

  // Add/Edit labour dialog
  const [labourDialogOpen, setLabourDialogOpen] = React.useState(false);
  const [editingLabour, setEditingLabour] = React.useState<Labour | null>(null);
  const [formName, setFormName] = React.useState("");
  const [formContact, setFormContact] = React.useState("");
  const [formAddress, setFormAddress] = React.useState("");
  const [formWagePeriod, setFormWagePeriod] = React.useState<WagePeriod>("daily");
  const [formWageAmount, setFormWageAmount] = React.useState(0);

  // Transaction dialog
  const [txDialogOpen, setTxDialogOpen] = React.useState(false);
  const [txLabour, setTxLabour] = React.useState<Labour | null>(null);
  const [txType, setTxType] = React.useState<LabourTransactionType>("wage");
  const [txAmount, setTxAmount] = React.useState(0);
  const [txNote, setTxNote] = React.useState("");

  // Delete
  const [deleteTarget, setDeleteTarget] = React.useState<Labour | null>(null);

  // Selected labour detail view
  const [selectedLabour, setSelectedLabour] = React.useState<Labour | null>(null);

  const refresh = React.useCallback(async () => {
    const all = await db.labours.orderBy("createdAt").reverse().toArray();
    setLabours(all);
    const txAll = await db.labourTransactions.orderBy("createdAt").reverse().toArray();
    setTransactions(txAll);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const openAddLabour = () => {
    setEditingLabour(null);
    setFormName("");
    setFormContact("");
    setFormAddress("");
    setFormWagePeriod("daily");
    setFormWageAmount(0);
    setLabourDialogOpen(true);
  };

  const openEditLabour = (l: Labour) => {
    setEditingLabour(l);
    setFormName(l.name);
    setFormContact(l.contact || "");
    setFormAddress(l.address || "");
    setFormWagePeriod(l.wagePeriod);
    setFormWageAmount(l.wageAmount);
    setLabourDialogOpen(true);
  };

  const saveLabour = async () => {
    try {
      if (!formName.trim()) throw new Error("Name is required");
      if (formWageAmount <= 0) throw new Error("Wage amount must be > 0");

      if (editingLabour) {
        await db.labours.update(editingLabour.id, {
          name: formName.trim(),
          contact: formContact.trim() || undefined,
          address: formAddress.trim() || undefined,
          wagePeriod: formWagePeriod,
          wageAmount: formWageAmount,
        });
        toast({ title: "Staff updated" });
      } else {
        const labour: Labour = {
          id: makeId("lab"),
          name: formName.trim(),
          contact: formContact.trim() || undefined,
          address: formAddress.trim() || undefined,
          wagePeriod: formWagePeriod,
          wageAmount: formWageAmount,
          advanceBalance: 0,
          shortBalance: 0,
          createdAt: Date.now(),
        };
        await db.labours.put(labour);
        toast({ title: "Staff added" });
      }
      setLabourDialogOpen(false);
      await refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    }
  };

  const openTxDialog = (l: Labour, type: LabourTransactionType) => {
    setTxLabour(l);
    setTxType(type);
    setTxAmount(type === "wage" ? l.wageAmount : 0);
    setTxNote("");
    setTxDialogOpen(true);
  };

  const saveTx = async () => {
    if (!txLabour || txAmount <= 0) return;
    try {
      const tx: LabourTransaction = {
        id: makeId("ltx"),
        labourId: txLabour.id,
        type: txType,
        amount: txAmount,
        note: txNote.trim() || undefined,
        workPeriodId,
        createdAt: Date.now(),
      };

      // Create expense record for wage and advance payments
      let expenseId: string | undefined;
      if (txType === "wage" || txType === "advance") {
        const expense = {
          id: makeId("exp"),
          name: `Staff/Wages - ${txLabour.name}`,
          amount: txAmount,
          note: txType === "advance" ? `Advance to ${txLabour.name}` : `Wage payment to ${txLabour.name}`,
          workPeriodId,
          createdAt: Date.now(),
        };
        await db.expenses.put(expense);
        expenseId = expense.id;
        tx.expenseId = expenseId;
      }

      await db.labourTransactions.put(tx);

      // Update balances
      const updates: Partial<Labour> = {};
      if (txType === "advance") {
        // If there's short balance, offset against it first
        const shortBal = txLabour.shortBalance;
        if (shortBal > 0) {
          const offset = Math.min(txAmount, shortBal);
          const remainder = txAmount - offset;
          updates.shortBalance = shortBal - offset;
          updates.advanceBalance = txLabour.advanceBalance + remainder;
        } else {
          updates.advanceBalance = txLabour.advanceBalance + txAmount;
        }
      } else if (txType === "short") {
        // If there's advance balance, offset against it first
        const advBal = txLabour.advanceBalance;
        if (advBal > 0) {
          const offset = Math.min(txAmount, advBal);
          const remainder = txAmount - offset;
          updates.advanceBalance = advBal - offset;
          updates.shortBalance = txLabour.shortBalance + remainder;
        } else {
          updates.shortBalance = txLabour.shortBalance + txAmount;
        }
      } else if (txType === "deduct_advance") {
        updates.advanceBalance = Math.max(0, txLabour.advanceBalance - txAmount);
      } else if (txType === "deduct_short") {
        updates.shortBalance = Math.max(0, txLabour.shortBalance - txAmount);
        const expense = {
          id: makeId("exp"),
          name: `Staff/Wages - ${txLabour.name}`,
          amount: txAmount,
          note: `Short salary payment to ${txLabour.name}`,
          workPeriodId,
          createdAt: Date.now(),
        };
        await db.expenses.put(expense);
        tx.expenseId = expense.id;
        await db.labourTransactions.update(tx.id, { expenseId: expense.id });
      } else if (txType === "wage") {
        const diff = txAmount - txLabour.wageAmount;
        if (diff > 0) {
          // Paid more than fixed wage — offset short first, remainder goes to advance
          const shortBal = txLabour.shortBalance;
          if (shortBal > 0) {
            const offset = Math.min(diff, shortBal);
            const remainder = diff - offset;
            updates.shortBalance = shortBal - offset;
            if (remainder > 0) updates.advanceBalance = txLabour.advanceBalance + remainder;
          } else {
            updates.advanceBalance = txLabour.advanceBalance + diff;
          }
        } else if (diff < 0) {
          // Paid less than fixed wage — offset advance first, remainder goes to short
          const gap = Math.abs(diff);
          const advBal = txLabour.advanceBalance;
          if (advBal > 0) {
            const offset = Math.min(gap, advBal);
            const remainder = gap - offset;
            updates.advanceBalance = advBal - offset;
            if (remainder > 0) updates.shortBalance = txLabour.shortBalance + remainder;
          } else {
            updates.shortBalance = txLabour.shortBalance + gap;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.labours.update(txLabour.id, updates);
      }

      const labels: Record<LabourTransactionType, string> = {
        wage: "Wage Paid",
        advance: "Advance Given",
        short: "Short Recorded",
        deduct_advance: "Advance Deducted",
        deduct_short: "Short Paid",
      };
      toast({ title: labels[txType], description: `${txLabour.name} — ${formatIntMoney(txAmount)}` });
      setTxDialogOpen(false);
      // Refresh selected labour
      if (selectedLabour?.id === txLabour.id) {
        const updated = await db.labours.get(txLabour.id);
        if (updated) setSelectedLabour(updated);
      }
      await refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await db.labourTransactions.where("labourId").equals(deleteTarget.id).delete();
    await db.labours.delete(deleteTarget.id);
    toast({ title: "Staff deleted" });
    setDeleteTarget(null);
    if (selectedLabour?.id === deleteTarget.id) setSelectedLabour(null);
    await refresh();
  };

  const labourTxs = selectedLabour
    ? transactions.filter((t) => t.labourId === selectedLabour.id)
    : [];

  const wagePeriodLabel = (p: WagePeriod) => WAGE_PERIODS.find((w) => w.value === p)?.label || p;
  const txTypeLabel = (t: LabourTransactionType) => {
    const m: Record<LabourTransactionType, string> = {
      wage: "Wage Paid",
      advance: "Advance Given",
      short: "Short Recorded",
      deduct_advance: "Advance Deducted",
      deduct_short: "Short Paid",
    };
    return m[t];
  };
  const txTypeColor = (t: LabourTransactionType) => {
    if (t === "advance" || t === "wage" || t === "deduct_short") return "text-destructive";
    if (t === "deduct_advance") return "text-green-600";
    return "text-orange-500";
  };

  const shareLabourPdf = async (labour: Labour) => {
    const txs = transactions.filter((t) => t.labourId === labour.id);
    if (txs.length === 0) {
      toast({ title: "No transactions to share" });
      return;
    }
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    let y = 15;
    const lm = 14;
    const addPage = () => { doc.addPage(); y = 15; };
    const checkPage = (need: number) => { if (y + need > 280) addPage(); };

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`${labour.name} — Wage Log`, pw / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Wage: ${formatIntMoney(labour.wageAmount)} (${wagePeriodLabel(labour.wagePeriod)})`, pw / 2, y, { align: "center" });
    y += 5;
    doc.text(`Advance Balance: ${formatIntMoney(labour.advanceBalance)}  |  Short Balance: ${formatIntMoney(labour.shortBalance)}`, pw / 2, y, { align: "center" });
    y += 8;

    // Table header
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Date", lm, y);
    doc.text("Type", lm + 35, y);
    doc.text("Amount", lm + 80, y);
    doc.text("Note", lm + 110, y);
    y += 1;
    doc.setDrawColor(180);
    doc.line(lm, y, pw - lm, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    for (const tx of txs) {
      checkPage(6);
      const d = new Date(tx.createdAt);
      doc.text(`${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, lm, y);
      doc.text(txTypeLabel(tx.type), lm + 35, y);
      doc.text(formatIntMoney(tx.amount), lm + 80, y);
      doc.text(tx.note || "-", lm + 110, y, { maxWidth: pw - lm - 115 });
      y += 5;
    }

    const blob = doc.output("blob");
    const file = new File([blob], `${labour.name}-wage-log.pdf`, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `${labour.name} Wage Log` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Detail view for selected labour
  if (selectedLabour) {
    const fresh = labours.find((l) => l.id === selectedLabour.id) || selectedLabour;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSelectedLabour(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{fresh.name}</h2>
            <p className="text-xs text-muted-foreground">
              {wagePeriodLabel(fresh.wagePeriod)} — {formatIntMoney(fresh.wageAmount)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void shareLabourPdf(fresh)} className="gap-1">
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
          <Button variant="outline" size="sm" onClick={() => openEditLabour(fresh)}>Edit</Button>
        </div>

        {/* Balance cards */}
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xs text-muted-foreground">Advance Balance</div>
              <div className="text-lg font-bold text-orange-500">{formatIntMoney(fresh.advanceBalance)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xs text-muted-foreground">Short Balance</div>
              <div className="text-lg font-bold text-destructive">{formatIntMoney(fresh.shortBalance)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="default" size="sm" onClick={() => openTxDialog(fresh, "wage")} className="gap-1">
            <Wallet className="h-3.5 w-3.5" /> Pay Wage
          </Button>
          <Button variant="outline" size="sm" onClick={() => openTxDialog(fresh, "advance")} className="gap-1">
            <ArrowUpCircle className="h-3.5 w-3.5" /> Give Advance
          </Button>
          <Button variant="outline" size="sm" onClick={() => openTxDialog(fresh, "short")} className="gap-1">
            <ArrowDownCircle className="h-3.5 w-3.5" /> Record Short
          </Button>
          {fresh.advanceBalance > 0 && (
            <Button variant="outline" size="sm" onClick={() => openTxDialog(fresh, "deduct_advance")} className="gap-1">
              <MinusCircle className="h-3.5 w-3.5" /> Deduct Advance
            </Button>
          )}
          {fresh.shortBalance > 0 && (
            <Button variant="outline" size="sm" onClick={() => openTxDialog(fresh, "deduct_short")} className="gap-1">
              <PlusCircle className="h-3.5 w-3.5" /> Pay Short
            </Button>
          )}
        </div>

        {/* Transaction history */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Transaction History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {labourTxs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No transactions yet.</div>
            ) : (
              labourTxs.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <div className="text-sm font-medium">{txTypeLabel(tx.type)}</div>
                    {tx.note && <div className="text-xs text-muted-foreground">{tx.note}</div>}
                    <div className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${txTypeColor(tx.type)}`}>
                    {formatIntMoney(tx.amount)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Shared dialogs rendered below */}
        {renderDialogs()}
      </div>
    );
  }

  function renderDialogs() {
    return (
      <>
        {/* Add/Edit Labour Dialog */}
        <Dialog open={labourDialogOpen} onOpenChange={setLabourDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingLabour ? "Edit Staff" : "Add Staff"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Worker name" />
              </div>
              <div className="space-y-1">
                <Label>Contact (optional)</Label>
                <Input value={formContact} onChange={(e) => setFormContact(e.target.value)} placeholder="Phone number" />
              </div>
              <div className="space-y-1">
                <Label>Address (optional)</Label>
                <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Address" />
              </div>
              <div className="space-y-1">
                <Label>Wage Period</Label>
                <Select value={formWagePeriod} onValueChange={(v) => setFormWagePeriod(v as WagePeriod)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WAGE_PERIODS.map((wp) => (
                      <SelectItem key={wp.value} value={wp.value}>{wp.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Wage Amount *</Label>
                <Input
                  inputMode="numeric"
                  value={formWageAmount === 0 ? "" : String(formWageAmount)}
                  onChange={(e) => setFormWageAmount(parseNonDecimalInt(e.target.value))}
                  placeholder="0"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLabourDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void saveLabour()} disabled={!formName.trim() || formWageAmount <= 0}>
                {editingLabour ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transaction Dialog */}
        <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {txType === "wage" && "Pay Wage"}
                {txType === "advance" && "Give Advance"}
                {txType === "short" && "Record Short Salary"}
                {txType === "deduct_advance" && "Deduct from Advance"}
                {txType === "deduct_short" && "Pay Short Salary"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {txLabour && (
                <div className="text-sm text-muted-foreground">
                  {txLabour.name} • Advance: {formatIntMoney(txLabour.advanceBalance)} • Short: {formatIntMoney(txLabour.shortBalance)}
                </div>
              )}
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input
                  inputMode="numeric"
                  value={txAmount === 0 ? "" : String(txAmount)}
                  onChange={(e) => setTxAmount(parseNonDecimalInt(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>Note (optional)</Label>
                <Input value={txNote} onChange={(e) => setTxNote(e.target.value)} placeholder="Optional note" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTxDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void saveTx()} disabled={txAmount <= 0}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Staff?</AlertDialogTitle>
              <AlertDialogDescription>
                Delete "{deleteTarget?.name}" and all their transactions? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Labour list view
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold flex-1">Staff / Wages</h2>
        <Button size="sm" onClick={openAddLabour}>
          <Plus className="h-4 w-4 mr-1" /> Add Staff
        </Button>
      </div>

      {labours.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No staff/workers added yet. Tap "Add Staff" to get started.
          </CardContent>
        </Card>
      ) : (
        labours.map((l) => (
          <Card key={l.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setSelectedLabour(l)}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{l.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {wagePeriodLabel(l.wagePeriod)} • {formatIntMoney(l.wageAmount)}
                  </div>
                  {(l.contact || l.address) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {l.contact}{l.contact && l.address ? " • " : ""}{l.address}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  {l.advanceBalance > 0 && (
                    <span className="text-xs text-orange-500">Adv: {formatIntMoney(l.advanceBalance)}</span>
                  )}
                  {l.shortBalance > 0 && (
                    <span className="text-xs text-destructive">Short: {formatIntMoney(l.shortBalance)}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 ml-2"
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(l); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {renderDialogs()}
    </div>
  );
}
