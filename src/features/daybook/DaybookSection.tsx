import React from "react";
import { db } from "@/db/appDb";
import type { DaybookAccount, DaybookEntry, DaybookImage, DaybookNote } from "@/db/daybook-schema";
import type { Settings } from "@/db/schema";
import { makeId } from "@/features/admin/id";
import { formatIntMoney, parseNonDecimalInt, fmtDateTime } from "@/features/pos/format";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";
import { buildSpendingSharePdf, buildDaybookReportPdf, buildBalancePdf } from "./daybook-pdf";
import { useToast } from "@/hooks/use-toast";
import { canMakeSale, incrementSaleCount } from "@/features/licensing/licensing-db";
import { UpgradeDialog } from "@/features/licensing/UpgradeDialog";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, Banknote, Building2, ArrowDownCircle, ArrowUpCircle,
  ImagePlus, Download, Upload, FileText, StickyNote,
} from "lucide-react";

const toDateVal = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function DaybookSection() {
  const { toast } = useToast();
  const now = Date.now();

  const [accounts, setAccounts] = React.useState<DaybookAccount[]>([]);
  const [entries, setEntries] = React.useState<DaybookEntry[]>([]);
  const [images, setImages] = React.useState<DaybookImage[]>([]);
  const [notes, setNotes] = React.useState<DaybookNote[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);

  // Dialogs
  const [addAccountOpen, setAddAccountOpen] = React.useState(false);
  const [addEntryOpen, setAddEntryOpen] = React.useState(false);
  const [entryType, setEntryType] = React.useState<"payment" | "spending">("payment");
  const [deleteTarget, setDeleteTarget] = React.useState<{ type: "account" | "entry" | "note"; id: string; label: string } | null>(null);

  // Notes
  const [addNoteOpen, setAddNoteOpen] = React.useState(false);
  const [noteText, setNoteText] = React.useState("");
  // Upgrade dialog
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [upgradeMsg, setUpgradeMsg] = React.useState("");

  // Account form
  const [accName, setAccName] = React.useState("");
  const [accType, setAccType] = React.useState<"cash" | "bank">("bank");
  const [accNumber, setAccNumber] = React.useState("");
  const [accIban, setAccIban] = React.useState("");
  const [accBalance, setAccBalance] = React.useState(0);

  // Entry form
  const [entryAccountId, setEntryAccountId] = React.useState("");
  const [entryAmount, setEntryAmount] = React.useState(0);
  const [entryComment, setEntryComment] = React.useState("");
  const [entryImages, setEntryImages] = React.useState<string[]>([]); // base64

  // Date filters
  const [filterFrom, setFilterFrom] = React.useState(toDateVal(now));
  const [filterTo, setFilterTo] = React.useState(toDateVal(now));

  // Backup
  const backupFileRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    const [accs, ents, imgs, nts, s] = await Promise.all([
      db.daybookAccounts.orderBy("createdAt").toArray(),
      db.daybookEntries.orderBy("createdAt").reverse().toArray(),
      db.daybookImages.orderBy("createdAt").toArray(),
      db.daybookNotes.orderBy("createdAt").reverse().toArray(),
      db.settings.get("app"),
    ]);
    setAccounts(accs);
    setEntries(ents);
    setImages(imgs);
    setNotes(nts);
    setSettings(s ?? null);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  // Filtered entries
  const filteredEntries = React.useMemo(() => {
    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd, 0, 0, 0, 0).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();
    return entries.filter(e => e.createdAt >= fromTs && e.createdAt <= toTs);
  }, [entries, filterFrom, filterTo]);

  const filteredSpendings = filteredEntries.filter(e => e.type === "spending");
  const filteredPayments = filteredEntries.filter(e => e.type === "payment");

  const businessName = settings?.restaurantName ?? "SANGI POS";

  // ── Account CRUD ──
  const saveAccount = async () => {
    if (!accName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const acc: DaybookAccount = {
      id: makeId("dba"),
      name: accName.trim(),
      type: accType,
      accountNumber: accNumber.trim() || undefined,
      iban: accIban.trim() || undefined,
      balance: accBalance,
      createdAt: Date.now(),
    };
    await db.daybookAccounts.put(acc);
    toast({ title: "Account added", description: `${acc.name} — ${formatIntMoney(acc.balance)}` });
    setAddAccountOpen(false);
    resetAccountForm();
    await refresh();
  };

  const resetAccountForm = () => { setAccName(""); setAccType("bank"); setAccNumber(""); setAccIban(""); setAccBalance(0); };

  // ── Entry CRUD ──
  const openAddEntry = (type: "payment" | "spending") => {
    setEntryType(type);
    setEntryAccountId(accounts[0]?.id ?? "");
    setEntryAmount(0);
    setEntryComment("");
    setEntryImages([]);
    setAddEntryOpen(true);
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => { if (reader.result) setEntryImages(prev => [...prev, reader.result as string]); };
      reader.readAsDataURL(file);
    });
  };

  const saveEntry = async () => {
    if (!entryAccountId) { toast({ title: "Select an account", variant: "destructive" }); return; }
    if (entryAmount <= 0) { toast({ title: "Amount must be > 0", variant: "destructive" }); return; }

    // License check
    const check = await canMakeSale("daybook");
    if (!check.allowed) {
      setUpgradeMsg(check.message);
      setUpgradeOpen(true);
      return;
    }

    const account = accounts.find(a => a.id === entryAccountId);
    if (!account) return;

    if (entryType === "spending" && account.balance < entryAmount) {
      toast({ title: "Insufficient balance", description: `${account.name} has ${formatIntMoney(account.balance)}`, variant: "destructive" });
      return;
    }

    const entry: DaybookEntry = {
      id: makeId("dbe"),
      type: entryType,
      accountId: entryAccountId,
      accountName: account.name,
      amount: entryAmount,
      comment: entryComment.trim() || undefined,
      createdAt: Date.now(),
    };

    // Update account balance
    const newBalance = entryType === "payment"
      ? account.balance + entryAmount
      : account.balance - entryAmount;

    await db.transaction("rw", [db.daybookEntries, db.daybookAccounts, db.daybookImages], async () => {
      await db.daybookEntries.put(entry);
      await db.daybookAccounts.update(entryAccountId, { balance: newBalance });

      // Save images
      for (const dataUrl of entryImages) {
        await db.daybookImages.put({
          id: makeId("dbi"),
          entryId: entry.id,
          dataUrl,
          createdAt: Date.now(),
        });
      }
    });

    await incrementSaleCount("daybook");
    toast({ title: entryType === "payment" ? "Payment added" : "Spending added", description: `${formatIntMoney(entryAmount)} — ${account.name}` });
    setAddEntryOpen(false);
    await refresh();
  };

  // ── Delete ──
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "account") {
      // Delete account and all its entries + images
      const relatedEntries = entries.filter(e => e.accountId === deleteTarget.id);
      const relatedImageIds = images.filter(img => relatedEntries.some(e => e.id === img.entryId)).map(i => i.id);
      await db.transaction("rw", [db.daybookAccounts, db.daybookEntries, db.daybookImages], async () => {
        await db.daybookAccounts.delete(deleteTarget.id);
        await db.daybookEntries.where("accountId").equals(deleteTarget.id).delete();
        for (const imgId of relatedImageIds) await db.daybookImages.delete(imgId);
      });
    } else {
      // Delete entry — reverse balance change
      const entry = entries.find(e => e.id === deleteTarget.id);
      if (entry) {
        const account = accounts.find(a => a.id === entry.accountId);
        const balanceChange = entry.type === "payment" ? -entry.amount : entry.amount;
        await db.transaction("rw", [db.daybookEntries, db.daybookAccounts, db.daybookImages], async () => {
          await db.daybookEntries.delete(entry.id);
          await db.daybookImages.where("entryId").equals(entry.id).delete();
          if (account) await db.daybookAccounts.update(account.id, { balance: account.balance + balanceChange });
        });
      }
    }
    toast({ title: "Deleted" });
    setDeleteTarget(null);
    await refresh();
  };

  // ── Share spending PDF ──
  const shareSpending = async (entry: DaybookEntry) => {
    const imgs = images.filter(i => i.entryId === entry.id);
    const doc = buildSpendingSharePdf(entry, imgs, businessName);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    await sharePdfBytes(bytes, `spending_${entry.id}.pdf`, "Spending Receipt");
  };

  // ── Balance PDF ──
  const buildBalanceBytes = () => {
    const doc = buildBalancePdf(accounts, filteredEntries, filterFrom, filterTo, businessName);
    return { bytes: new Uint8Array(doc.output("arraybuffer")), fileName: `balance_${filterFrom}_${filterTo}.pdf` };
  };

  // ── Report PDF ──
  const buildReportBytes = () => {
    if (filteredEntries.length === 0) throw new Error("No entries in date range");
    const doc = buildDaybookReportPdf(filteredEntries, accounts, filterFrom, filterTo, businessName);
    return { bytes: new Uint8Array(doc.output("arraybuffer")), fileName: `daybook_report_${filterFrom}_${filterTo}.pdf` };
  };

  // ── Backup / Restore ──
  const exportBackup = async () => {
    const data = { accounts, entries, images };
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daybook_backup_${toDateVal(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Backup exported", description: `${accounts.length} accounts, ${entries.length} entries, ${images.length} images` });
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.accounts || !data.entries) throw new Error("Invalid backup file");
      await db.transaction("rw", [db.daybookAccounts, db.daybookEntries, db.daybookImages], async () => {
        // Clear existing
        await db.daybookAccounts.clear();
        await db.daybookEntries.clear();
        await db.daybookImages.clear();
        // Restore
        await db.daybookAccounts.bulkPut(data.accounts);
        await db.daybookEntries.bulkPut(data.entries);
        if (data.images) await db.daybookImages.bulkPut(data.images);
      });
      toast({ title: "Backup restored", description: `${data.accounts.length} accounts, ${data.entries.length} entries` });
      await refresh();
    } catch (err: any) {
      toast({ title: "Restore failed", description: err?.message ?? String(err), variant: "destructive" });
    }
    if (backupFileRef.current) backupFileRef.current.value = "";
  };

  return (
    <div className="space-y-4 pb-20">
      {/* ── Total Balance ── */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2"><Banknote className="h-4 w-4" /> Total Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-primary">{formatIntMoney(totalBalance)}</div>
          <div className="mt-2 space-y-1">
            {accounts.map(acc => (
              <div key={acc.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {acc.type === "cash" ? <Banknote className="h-3.5 w-3.5 text-emerald-600" /> : <Building2 className="h-3.5 w-3.5 text-blue-600" />}
                  <span>{acc.name}</span>
                  {acc.accountNumber && <span className="text-xs text-muted-foreground">({acc.accountNumber})</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatIntMoney(acc.balance)}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget({ type: "account", id: acc.id, label: acc.name })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { resetAccountForm(); setAddAccountOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Account
          </Button>
        </CardContent>
      </Card>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => openAddEntry("payment")} className="h-12 bg-emerald-600 hover:bg-emerald-700">
          <ArrowDownCircle className="h-4 w-4 mr-1" /> Add Payment
        </Button>
        <Button onClick={() => openAddEntry("spending")} variant="destructive" className="h-12">
          <ArrowUpCircle className="h-4 w-4 mr-1" /> Add Spending
        </Button>
      </div>

      {/* ── Date Range Filter ── */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Date Range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Spendings Section ── */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base text-destructive">Spendings ({filteredSpendings.length})</CardTitle>
          <CardDescription>Total: {formatIntMoney(filteredSpendings.reduce((s, e) => s + e.amount, 0))}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredSpendings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spendings in this range.</p>
          ) : filteredSpendings.map(e => {
            const hasImgs = images.some(i => i.entryId === e.id);
            return (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    <span className="text-sm font-medium">{formatIntMoney(e.amount)}</span>
                    <span className="text-xs text-muted-foreground">from {e.accountName}</span>
                  </div>
                  {e.comment && <p className="text-xs text-muted-foreground mt-0.5">{e.comment}</p>}
                  <p className="text-[10px] text-muted-foreground">{fmtDateTime(e.createdAt)}</p>
                  {hasImgs && <span className="text-[10px] text-blue-600">📎 has attachment</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void shareSpending(e)}>
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget({ type: "entry", id: e.id, label: formatIntMoney(e.amount) })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Payments Section ── */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base text-emerald-600">Payments ({filteredPayments.length})</CardTitle>
          <CardDescription>Total: {formatIntMoney(filteredPayments.reduce((s, e) => s + e.amount, 0))}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments in this range.</p>
          ) : filteredPayments.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-sm font-medium">{formatIntMoney(e.amount)}</span>
                  <span className="text-xs text-muted-foreground">to {e.accountName}</span>
                </div>
                {e.comment && <p className="text-xs text-muted-foreground mt-0.5">{e.comment}</p>}
                <p className="text-[10px] text-muted-foreground">{fmtDateTime(e.createdAt)}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget({ type: "entry", id: e.id, label: formatIntMoney(e.amount) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Reports Section ── */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Reports & Share</CardTitle>
          <CardDescription>Share balance or full report as PDF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <SaveShareMenu
              label="Balance PDF"
              getDefaultFileName={() => `balance_${filterFrom}_${filterTo}.pdf`}
              onSave={(fn) => { const { bytes, fileName } = buildBalanceBytes(); void savePdfBytes(bytes, fn ?? fileName); }}
              onShare={() => { const { bytes, fileName } = buildBalanceBytes(); void sharePdfBytes(bytes, fileName, "Balance Summary"); }}
              disabled={accounts.length === 0}
            />
            <SaveShareMenu
              label="Full Report PDF"
              getDefaultFileName={() => `daybook_report_${filterFrom}_${filterTo}.pdf`}
              onSave={(fn) => { try { const { bytes, fileName } = buildReportBytes(); void savePdfBytes(bytes, fn ?? fileName); } catch (e: any) { toast({ title: e.message, variant: "destructive" }); } }}
              onShare={() => { try { const { bytes, fileName } = buildReportBytes(); void sharePdfBytes(bytes, fileName, "Daybook Report"); } catch (e: any) { toast({ title: e.message, variant: "destructive" }); } }}
              disabled={filteredEntries.length === 0}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Backup / Restore Section ── */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Backup & Restore</CardTitle>
          <CardDescription>Export or import all daybook data including images</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportBackup}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export Backup
          </Button>
          <Button variant="outline" size="sm" onClick={() => backupFileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Restore Backup
          </Button>
          <input ref={backupFileRef} type="file" accept=".json" className="hidden" onChange={importBackup} />
        </CardContent>
      </Card>

      {/* ── Add Account Dialog ── */}
      <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              {(["cash", "bank"] as const).map(t => (
                <button key={t} type="button" onClick={() => setAccType(t)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize transition-colors ${accType === t ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"}`}>
                  {t === "cash" ? "💵 Cash" : "🏦 Bank"}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={accName} onChange={e => setAccName(e.target.value)} placeholder={accType === "cash" ? "Cash" : "Bank name"} />
            </div>
            {accType === "bank" && (
              <>
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input value={accNumber} onChange={e => setAccNumber(e.target.value)} placeholder="Optional" />
                </div>
                <div className="space-y-2">
                  <Label>IBAN</Label>
                  <Input value={accIban} onChange={e => setAccIban(e.target.value)} placeholder="Optional" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Opening Balance</Label>
              <Input inputMode="numeric" value={accBalance === 0 ? "" : String(accBalance)} onChange={e => setAccBalance(parseNonDecimalInt(e.target.value))} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAccountOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveAccount()} disabled={!accName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Entry Dialog ── */}
      <Dialog open={addEntryOpen} onOpenChange={setAddEntryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entryType === "payment" ? "Add Payment" : "Add Spending"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Account</Label>
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add an account first.</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {accounts.map(acc => (
                    <button key={acc.id} type="button" onClick={() => setEntryAccountId(acc.id)}
                      className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${entryAccountId === acc.id ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"}`}>
                      <div>{acc.name}</div>
                      <div className="text-xs text-muted-foreground">{formatIntMoney(acc.balance)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input inputMode="numeric" value={entryAmount === 0 ? "" : String(entryAmount)} onChange={e => setEntryAmount(parseNonDecimalInt(e.target.value))} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Comment (optional)</Label>
              <Input value={entryComment} onChange={e => setEntryComment(e.target.value)} placeholder="e.g., Rent payment" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><ImagePlus className="h-3.5 w-3.5" /> Attach Screenshot (optional)</Label>
              <Input type="file" accept="image/*" multiple onChange={handleImagePick} className="text-sm" />
              {entryImages.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-1">
                  {entryImages.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img} alt="" className="h-16 w-16 rounded border object-cover" />
                      <button type="button" className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground h-4 w-4 text-[10px] flex items-center justify-center"
                        onClick={() => setEntryImages(prev => prev.filter((_, j) => j !== i))}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEntryOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveEntry()} disabled={!entryAccountId || entryAmount <= 0}>
              {entryType === "payment" ? "Add Payment" : "Add Spending"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "account" ? "Account" : "Entry"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "account"
                ? `Delete "${deleteTarget.label}" and all its transactions? This cannot be undone.`
                : `Delete entry of ${deleteTarget?.label}? Balance will be reversed. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} message={upgradeMsg} />
    </div>
  );
}
