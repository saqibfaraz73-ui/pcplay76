import React from "react";
import jsPDF from "jspdf";
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
import type { Supplier, SupplierPayment, SupplierArrival, Settings, Expense } from "@/db/schema";
import { STOCK_UNITS } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import { useWorkPeriod } from "@/features/pos/WorkPeriodProvider";
import { makeId } from "@/features/admin/id";
import { formatIntMoney, parseNonDecimalInt } from "@/features/pos/format";
import { writePdfFile, shareFile } from "@/features/files/sangi-folders";
import { Capacitor } from "@capacitor/core";
import { Plus, Trash2, Share2, CreditCard, Banknote, PackagePlus, Upload, Download, Printer } from "lucide-react";
import { printEntryReceipt, shareEntryReceipt, type EntryReceiptData } from "@/features/pos/entry-receipt";
import { importArrivalsFromExcel, importArrivalsForSupplier, downloadImportTemplate, downloadPartyImportTemplate } from "@/features/party-import/party-import";
import { canMakeSale, incrementSaleCount } from "@/features/licensing/licensing-db";
import { UpgradeDialog } from "@/features/licensing/UpgradeDialog";
import { ExportPartySection } from "@/features/export-party/ExportPartySection";

type SupplierMode = { open: false } | { open: true; supplier?: Supplier };
type PayMode = { open: false } | { open: true; supplier: Supplier };
type ArrivalMode = { open: false } | { open: true; supplier: Supplier };

export default function PosPartyLodge() {
  const { toast } = useToast();
  const { session } = useAuth();
  const { currentWorkPeriod } = useWorkPeriod();

  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [payments, setPayments] = React.useState<SupplierPayment[]>([]);
  const [arrivals, setArrivals] = React.useState<SupplierArrival[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);

  const arrivalFileRef = React.useRef<HTMLInputElement>(null);
  const [importForSupplier, setImportForSupplier] = React.useState<Supplier | null>(null);

  const [supplierMode, setSupplierMode] = React.useState<SupplierMode>({ open: false });
  const [payMode, setPayMode] = React.useState<PayMode>({ open: false });
  const [deleteTarget, setDeleteTarget] = React.useState<Supplier | null>(null);
  const [arrivalMode, setArrivalMode] = React.useState<ArrivalMode>({ open: false });

  // Upgrade dialog
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [upgradeMsg, setUpgradeMsg] = React.useState("");

  // Arrival form - multi-item
  type ArrivalItem = {
    key: string;
    itemName: string;
    qty: number;
    unitPrice: number;
    unit: string;
    manualTotal: number;
    useManualTotal: boolean;
  };
  const makeEmptyItem = (): ArrivalItem => ({
    key: makeId("ai"),
    itemName: "",
    qty: 0,
    unitPrice: 0,
    unit: "",
    manualTotal: 0,
    useManualTotal: false,
  });
  const [arrivalItems, setArrivalItems] = React.useState<ArrivalItem[]>([makeEmptyItem()]);
  const [arrivalNote, setArrivalNote] = React.useState("");
  // Supplier form
  const [sName, setSName] = React.useState("");
  const [sContact, setSContact] = React.useState("");
  const [sItemName, setSItemName] = React.useState("");
  const [sUnit, setSUnit] = React.useState("");
  const [sUnitPrice, setSUnitPrice] = React.useState(0);
  const [sBalance, setSBalance] = React.useState(0);
  const [sAddBalance, setSAddBalance] = React.useState(0);

  // Payment form
  const [payAmount, setPayAmount] = React.useState(0);
  const [payType, setPayType] = React.useState<"cash" | "bank">("cash");
  const [payNote, setPayNote] = React.useState("");
  const [payAsExpense, setPayAsExpense] = React.useState(true);

  // PDF filter
  const toDateVal = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [filterFrom, setFilterFrom] = React.useState(toDateVal(Date.now() - 30 * 86400000));
  const [filterTo, setFilterTo] = React.useState(toDateVal(Date.now()));

  // Selected supplier for detail view
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const refresh = React.useCallback(async () => {
    const [sups, pays, arrs, s] = await Promise.all([
      db.suppliers.orderBy("createdAt").toArray(),
      db.supplierPayments.orderBy("createdAt").toArray(),
      db.supplierArrivals.orderBy("createdAt").toArray(),
      db.settings.get("app"),
    ]);
    setSuppliers(sups);
    setPayments(pays);
    setArrivals(arrs);
    setSettings(s ?? null);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const getSupplierBalance = React.useCallback((sup: Supplier) => {
    const totalPaid = payments
      .filter((p) => p.supplierId === sup.id)
      .reduce((sum, p) => sum + p.amount, 0);
    return sup.totalBalance - totalPaid;
  }, [payments]);

  const filtered = suppliers.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.contact ?? "").includes(q) || (s.itemName ?? "").toLowerCase().includes(q);
  });

  const selectedSupplier = suppliers.find((s) => s.id === selectedId);
  const selectedPayments = React.useMemo(
    () => payments.filter((p) => p.supplierId === selectedId).sort((a, b) => b.createdAt - a.createdAt),
    [payments, selectedId],
  );
  const selectedArrivals = React.useMemo(
    () => arrivals.filter((a) => a.supplierId === selectedId).sort((a, b) => b.createdAt - a.createdAt),
    [arrivals, selectedId],
  );

  // ─── Supplier CRUD ────────────────────────────────────

  const openNew = () => {
    setSName(""); setSContact(""); setSItemName(""); setSUnit(""); setSUnitPrice(0); setSBalance(0); setSAddBalance(0);
    setSupplierMode({ open: true });
  };

  const openEdit = (s: Supplier) => {
    setSName(s.name); setSContact(s.contact ?? ""); setSItemName(s.itemName ?? "");
    setSUnit(s.stockUnit ?? ""); setSUnitPrice(s.unitPrice ?? 0); setSBalance(s.totalBalance); setSAddBalance(0);
    setSupplierMode({ open: true, supplier: s });
  };

  const saveSupplier = async () => {
    try {
      const name = sName.trim();
      if (!name) throw new Error("Supplier name is required.");
      const isEdit = supplierMode.open && supplierMode.supplier;

      // License check only for new suppliers
      if (!isEdit) {
        const check = await canMakeSale("partyLodge");
        if (!check.allowed) {
          setUpgradeMsg(check.message);
          setUpgradeOpen(true);
          return;
        }
      }

      const now = Date.now();
      const existingBalance = isEdit ? supplierMode.supplier!.totalBalance : 0;
      const newBalance = isEdit ? existingBalance + sAddBalance : sBalance;
      const next: Supplier = {
        id: isEdit ? supplierMode.supplier!.id : makeId("sup"),
        name,
        contact: sContact.trim() || undefined,
        itemName: sItemName.trim() || undefined,
        stockUnit: (sUnit as any) || undefined,
        unitPrice: sUnitPrice || undefined,
        totalBalance: newBalance,
        createdAt: isEdit ? supplierMode.supplier!.createdAt : now,
      };
      await db.suppliers.put(next);
      if (!isEdit) await incrementSaleCount("partyLodge");
      toast({ title: "Supplier saved" });
      setSupplierMode({ open: false });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await db.transaction("rw", [db.suppliers, db.supplierPayments, db.supplierArrivals], async () => {
      await db.supplierPayments.where("supplierId").equals(deleteTarget.id).delete();
      await db.supplierArrivals.where("supplierId").equals(deleteTarget.id).delete();
      await db.suppliers.delete(deleteTarget.id);
    });
    toast({ title: "Supplier deleted" });
    setDeleteTarget(null);
    if (selectedId === deleteTarget.id) setSelectedId(null);
    await refresh();
  };

  // ─── Payment ──────────────────────────────────────────

  const openPayDialog = (sup: Supplier) => {
    setPayAmount(0); setPayType("cash"); setPayNote(""); setPayAsExpense(true);
    setPayMode({ open: true, supplier: sup });
  };

  const savePayment = async () => {
    if (!payMode.open) return;
    try {
      if (payAmount <= 0) throw new Error("Amount must be greater than 0");
      const sup = payMode.supplier;

      let expenseId: string | undefined;

      // Create expense record if requested
      if (payAsExpense) {
        const expense: Expense = {
          id: makeId("exp"),
          name: `Supplier: ${sup.name}`,
          amount: payAmount,
          note: payNote.trim() || `Payment to ${sup.name} (${payType})`,
          workPeriodId: currentWorkPeriod?.id,
          createdAt: Date.now(),
        };
        await db.expenses.put(expense);
        expenseId = expense.id;
      }

      const payment: SupplierPayment = {
        id: makeId("spay"),
        supplierId: sup.id,
        amount: payAmount,
        paymentType: payType,
        note: payNote.trim() || undefined,
        expenseId,
        createdAt: Date.now(),
      };
      await db.supplierPayments.put(payment);
      toast({ title: "Payment recorded", description: payAsExpense ? "Also recorded as expense" : undefined });
      setPayMode({ open: false });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // ─── Arrival ──────────────────────────────────────────

  const openArrivalDialog = (sup: Supplier) => {
    setArrivalItems([{
      ...makeEmptyItem(),
      itemName: sup.itemName ?? "",
      unitPrice: sup.unitPrice ?? 0,
      unit: sup.stockUnit ?? "",
    }]);
    setArrivalNote("");
    setArrivalMode({ open: true, supplier: sup });
  };

  const updateArrivalItem = (key: string, patch: Partial<ArrivalItem>) => {
    setArrivalItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeArrivalItem = (key: string) => {
    setArrivalItems((prev) => prev.length > 1 ? prev.filter((it) => it.key !== key) : prev);
  };

  const addArrivalItem = () => {
    setArrivalItems((prev) => [...prev, makeEmptyItem()]);
  };

  const getItemTotal = (it: ArrivalItem) => it.useManualTotal ? it.manualTotal : it.qty * it.unitPrice;

  const arrivalTotal = React.useMemo(() => {
    if (!arrivalMode.open) return 0;
    return arrivalItems.reduce((sum, it) => sum + getItemTotal(it), 0);
  }, [arrivalMode.open, arrivalItems]);

  const buildArrivalReceiptData = (): EntryReceiptData | null => {
    if (!arrivalMode.open) return null;
    const validItems = arrivalItems.filter((it) => it.useManualTotal ? it.manualTotal > 0 : (it.qty > 0 && it.unitPrice > 0));
    if (validItems.length === 0) return null;
    return {
      type: "arrival",
      partyName: arrivalMode.supplier.name,
      lines: validItems.map((it) => ({
        itemName: it.itemName.trim() || arrivalMode.supplier.itemName || "—",
        qty: it.qty,
        unit: it.unit || undefined,
        unitPrice: it.unitPrice,
        total: getItemTotal(it),
      })),
      grandTotal: arrivalTotal,
      note: arrivalNote.trim() || undefined,
      date: new Date(),
    };
  };

  const saveArrival = async (postAction?: "print" | "share") => {
    if (!arrivalMode.open) return;
    try {
      const validItems = arrivalItems.filter((it) => {
        if (it.useManualTotal) return it.manualTotal > 0;
        return it.qty > 0 && it.unitPrice > 0;
      });
      if (validItems.length === 0) throw new Error("Add at least one item with valid amounts");
      const sup = arrivalMode.supplier;
      let totalAdded = 0;

      const receiptData = buildArrivalReceiptData();

      await db.transaction("rw", [db.suppliers, db.supplierArrivals], async () => {
        for (const it of validItems) {
          const total = getItemTotal(it);
          totalAdded += total;
          const arrival: SupplierArrival = {
            id: makeId("sarr"),
            supplierId: sup.id,
            itemName: it.itemName.trim() || sup.itemName || "—",
            qty: it.qty,
            unit: it.unit || undefined,
            unitPrice: it.unitPrice,
            total,
            note: arrivalNote.trim() || undefined,
            createdAt: Date.now(),
          };
          await db.supplierArrivals.put(arrival);
        }
        await db.suppliers.update(sup.id, {
          totalBalance: sup.totalBalance + totalAdded,
        });
      });

      toast({
        title: "Supply arrival recorded",
        description: `${validItems.length} item(s) totalling ${formatIntMoney(totalAdded)} added to balance`,
      });
      setArrivalMode({ open: false });
      await refresh();

      // Post-save action
      if (receiptData && postAction === "print") {
        try { await printEntryReceipt(receiptData); } catch (pe: any) {
          toast({ title: "Print failed", description: pe?.message ?? String(pe), variant: "destructive" });
        }
      } else if (receiptData && postAction === "share") {
        try { await shareEntryReceipt(receiptData); } catch (se: any) {
          toast({ title: "Share failed", description: se?.message ?? String(se), variant: "destructive" });
        }
      }
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // ─── PDF ──────────────────────────────────────────────

  const buildPartyPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40;
    const right = pageW - 40;
    let y = 48;
    const lineH = 14;
    const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };

    const restaurantName = settings?.restaurantName ?? "SANGI POS";
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("Party Lodge Report", left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

    for (const sup of suppliers) {
      const supArrivals = arrivals
        .filter((a) => a.supplierId === sup.id && a.createdAt >= fromTs && a.createdAt <= toTs)
        .sort((a, b) => a.createdAt - b.createdAt);
      const supPayments = payments
        .filter((p) => p.supplierId === sup.id && p.createdAt >= fromTs && p.createdAt <= toTs)
        .sort((a, b) => a.createdAt - b.createdAt);

      const balance = getSupplierBalance(sup);

      // Running balance calculation
      const paymentsAfterRange = payments.filter((p) => p.supplierId === sup.id && p.createdAt > toTs).reduce((s, p) => s + p.amount, 0);
      const arrivalsAfterRange = arrivals.filter((a) => a.supplierId === sup.id && a.createdAt > toTs).reduce((s, a) => s + a.total, 0);
      const balanceAtEndOfRange = balance + paymentsAfterRange - arrivalsAfterRange;

      // Arrival running balances
      let arrRunBal = balanceAtEndOfRange;
      const arrBalAfter: number[] = [];
      // We need to account for payments in range too. Let's merge events chronologically.
      // Simpler: compute arrival balances independently
      const totalPaymentsInRange = supPayments.reduce((s, p) => s + p.amount, 0);
      let arrEndBal = balanceAtEndOfRange; // this includes effect of payments in range
      // To get balance just from arrivals perspective, we separate
      // Actually let's just compute from start: balance before range + arrivals - payments = balance at end
      // balanceBeforeRange = balanceAtEndOfRange - totalArrivalsInRange + totalPaymentsInRange
      const totalArrivalsInRange = supArrivals.reduce((s, a) => s + a.total, 0);
      const balanceBeforeRange = balanceAtEndOfRange - totalArrivalsInRange + totalPaymentsInRange;
      
      let runBal = balanceBeforeRange;
      for (let i = 0; i < supArrivals.length; i++) {
        runBal += supArrivals[i].total;
        arrBalAfter[i] = runBal;
      }

      // Payment running balances (from balance before range, considering arrivals happened)
      let payRunBal = balanceBeforeRange + totalArrivalsInRange; // balance before any payments but after all arrivals
      // Actually better: balance before range, then subtract payments
      let payBal = balanceBeforeRange + totalArrivalsInRange;
      const payBalAfter: number[] = [];
      for (let i = 0; i < supPayments.length; i++) {
        payBal -= supPayments[i].amount;
        payBalAfter[i] = payBal;
      }

      checkPage(60 + (supArrivals.length + supPayments.length) * lineH);
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text(sup.name, left, y);
      doc.text(`Current Balance: ${formatIntMoney(balance)}`, right, y, { align: "right" }); y += 14;

      if (sup.contact) { doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100); doc.text(`Contact: ${sup.contact}`, left, y); y += 10; }
      if (sup.itemName) { doc.setFontSize(8); doc.text(`Item: ${sup.itemName}`, left, y); y += 10; }

      // Arrivals section
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text("Arrivals:", left + 4, y); y += 12;
      if (supArrivals.length > 0) {
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
        doc.text("#", left + 4, y); doc.text("Item", left + 20, y); doc.text("Qty", left + 120, y); doc.text("Total", left + 170, y); doc.text("Date", left + 240, y); doc.text("Bal After", right - 10, y, { align: "right" }); y += 10;
        doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
        doc.setFont("helvetica", "normal"); doc.setTextColor(0);
        supArrivals.forEach((a, idx) => {
          checkPage();
          doc.setFontSize(8);
          doc.text(String(idx + 1), left + 4, y);
          doc.text((a.itemName ?? "").slice(0, 16), left + 20, y);
          doc.text(`${a.qty} ${a.unit || ""}`, left + 120, y);
          doc.text(formatIntMoney(a.total), left + 170, y);
          doc.text(new Date(a.createdAt).toLocaleDateString(), left + 240, y);
          doc.text(formatIntMoney(arrBalAfter[idx]), right - 10, y, { align: "right" });
          y += lineH;
        });
      } else {
        doc.setFontSize(8); doc.setTextColor(120); doc.text("No arrivals in this period", left + 10, y); y += lineH;
      }
      y += 6;

      // Payments section
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text("Payments:", left + 4, y); y += 12;
      if (supPayments.length > 0) {
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
        doc.text("#", left + 4, y); doc.text("Amount", left + 30, y); doc.text("Type", left + 120, y); doc.text("Date", left + 180, y); doc.text("Bal After", right - 10, y, { align: "right" }); y += 10;
        doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);

        doc.setFont("helvetica", "normal"); doc.setTextColor(0);
        supPayments.forEach((p, idx) => {
          checkPage();
          doc.setFontSize(9);
          doc.text(String(idx + 1), left + 4, y);
          doc.text(formatIntMoney(p.amount), left + 30, y);
          doc.text(p.paymentType ?? "—", left + 120, y);
          doc.text(new Date(p.createdAt).toLocaleDateString(), left + 180, y);
          doc.text(formatIntMoney(payBalAfter[idx]), right - 10, y, { align: "right" });
          y += lineH;
        });
      } else {
        doc.setFontSize(8); doc.setTextColor(120); doc.text("No payments in this period", left + 10, y); y += lineH;
      }
      y += 16;
    }
    return doc;
  };

  const buildSingleSupplierPdf = (sup: Supplier) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40;
    const right = pageW - 40;
    let y = 48;
    const lineH = 14;
    const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };

    const restaurantName = settings?.restaurantName ?? "SANGI POS";
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text(`Supplier Lodge: ${sup.name}`, left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

    const supArrivals = arrivals
      .filter((a) => a.supplierId === sup.id && a.createdAt >= fromTs && a.createdAt <= toTs)
      .sort((a, b) => a.createdAt - b.createdAt);
    const supPayments = payments
      .filter((p) => p.supplierId === sup.id && p.createdAt >= fromTs && p.createdAt <= toTs)
      .sort((a, b) => a.createdAt - b.createdAt);

    const balance = getSupplierBalance(sup);
    const totalArrivalsInRange = supArrivals.reduce((s, a) => s + a.total, 0);
    const totalPaidInRange = supPayments.reduce((s, p) => s + p.amount, 0);

    // Supplier details
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text(sup.name, left, y);
    doc.text(`Balance: ${formatIntMoney(balance)}`, right, y, { align: "right" }); y += 14;

    if (sup.contact) { doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100); doc.text(`Contact: ${sup.contact}`, left, y); y += 12; }
    if (sup.itemName) { doc.setFontSize(9); doc.text(`Item: ${sup.itemName}${sup.stockUnit ? ` (${sup.stockUnit})` : ""}${sup.unitPrice ? ` @ ${formatIntMoney(sup.unitPrice)}` : ""}`, left, y); y += 12; }
    doc.setFontSize(9); doc.setTextColor(0);
    doc.text(`Total Balance: ${formatIntMoney(sup.totalBalance)}`, left, y); y += 12;
    doc.text(`Total Arrivals: ${formatIntMoney(totalArrivalsInRange)}`, left, y); y += 12;
    doc.text(`Total Paid: ${formatIntMoney(totalPaidInRange)}`, left, y); y += 16;

    // Arrivals section
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text("Arrivals:", left + 4, y); y += 12;
    if (supArrivals.length > 0) {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("#", left + 4, y); doc.text("Item", left + 20, y); doc.text("Qty", left + 130, y); doc.text("Price", left + 180, y); doc.text("Total", left + 240, y); doc.text("Note", left + 310, y); doc.text("Date", right - 10, y, { align: "right" }); y += 10;
      doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0);
      supArrivals.forEach((a, idx) => {
        checkPage();
        doc.setFontSize(8);
        doc.text(String(idx + 1), left + 4, y);
        doc.text((a.itemName ?? "").slice(0, 16), left + 20, y);
        doc.text(`${a.qty} ${a.unit || ""}`, left + 130, y);
        doc.text(formatIntMoney(a.unitPrice), left + 180, y);
        doc.text(formatIntMoney(a.total), left + 240, y);
        doc.text((a.note ?? "").slice(0, 15), left + 310, y);
        doc.text(new Date(a.createdAt).toLocaleDateString(), right - 10, y, { align: "right" });
        y += lineH;
      });
    } else {
      doc.setFontSize(8); doc.setTextColor(120); doc.text("No arrivals in this period", left + 10, y); y += lineH;
    }
    y += 8;

    // Payments section
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text("Payments:", left + 4, y); y += 12;
    if (supPayments.length > 0) {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("#", left + 4, y); doc.text("Amount", left + 30, y); doc.text("Type", left + 140, y); doc.text("Note", left + 200, y); doc.text("Date", right - 10, y, { align: "right" }); y += 10;
      doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);

      doc.setFont("helvetica", "normal"); doc.setTextColor(0);
      supPayments.forEach((p, idx) => {
        checkPage();
        doc.setFontSize(9);
        doc.text(String(idx + 1), left + 4, y);
        doc.text(formatIntMoney(p.amount), left + 30, y);
        doc.text(p.paymentType ?? "—", left + 140, y);
        doc.text((p.note ?? "").slice(0, 25), left + 200, y);
        doc.text(new Date(p.createdAt).toLocaleDateString(), right - 10, y, { align: "right" });
        y += lineH;
      });
    } else {
      doc.setFontSize(9); doc.setTextColor(120); doc.text("No payments in this period", left + 4, y); y += lineH;
    }

    return doc;
  };

  const buildArrivalsReportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40;
    const right = pageW - 40;
    let y = 48;
    const lineH = 14;
    const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };

    const restaurantName = settings?.restaurantName ?? "SANGI POS";
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("Arrivals Report", left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

    let grandTotal = 0;

    for (const sup of suppliers) {
      const supArrivals = arrivals
        .filter((a) => a.supplierId === sup.id && a.createdAt >= fromTs && a.createdAt <= toTs)
        .sort((a, b) => a.createdAt - b.createdAt);
      if (supArrivals.length === 0) continue;

      const supTotal = supArrivals.reduce((s, a) => s + a.total, 0);
      grandTotal += supTotal;

      const currentBalance = getSupplierBalance(sup);
      const paymentsAfterRange = payments.filter((p) => p.supplierId === sup.id && p.createdAt > toTs).reduce((s, p) => s + p.amount, 0);
      const arrivalsAfterRange = arrivals.filter((a) => a.supplierId === sup.id && a.createdAt > toTs).reduce((s, a) => s + a.total, 0);
      const balanceAtEndOfRange = currentBalance + paymentsAfterRange - arrivalsAfterRange;
      // Work backwards for running balance after each arrival
      let runningBal = balanceAtEndOfRange;
      const balAfter: number[] = [];
      for (let i = supArrivals.length - 1; i >= 0; i--) {
        balAfter[i] = runningBal;
        runningBal -= supArrivals[i].total; // before this arrival, balance was lower
      }

      checkPage(40 + supArrivals.length * lineH);
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text(sup.name, left, y);
      doc.text(`Current Balance: ${formatIntMoney(currentBalance)}`, right, y, { align: "right" }); y += 14;

      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("#", left + 4, y); doc.text("Item", left + 20, y); doc.text("Qty", left + 120, y); doc.text("Total", left + 170, y); doc.text("Date", left + 240, y); doc.text("Bal After", right - 10, y, { align: "right" }); y += 10;
      doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0);

      supArrivals.forEach((a, idx) => {
        checkPage();
        doc.setFontSize(8);
        doc.text(String(idx + 1), left + 4, y);
        doc.text((a.itemName ?? "").slice(0, 16), left + 20, y);
        doc.text(`${a.qty} ${a.unit || ""}`, left + 120, y);
        doc.text(formatIntMoney(a.total), left + 170, y);
        doc.text(new Date(a.createdAt).toLocaleDateString(), left + 240, y);
        doc.text(formatIntMoney(balAfter[idx]), right - 10, y, { align: "right" });
        y += lineH;
      });
      y += 12;
    }

    // Grand total
    checkPage(30);
    doc.setDrawColor(0); doc.line(left, y, right, y); y += 14;
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text("Grand Total Arrivals:", left, y);
    doc.text(formatIntMoney(grandTotal), right, y, { align: "right" });

    return doc;
  };

  const shareArrivalsPdf = async () => {
    try {
      if (arrivals.length === 0) { toast({ title: "No arrivals to export", variant: "destructive" }); return; }
      const doc = buildArrivalsReportPdf();
      const bytes = doc.output("arraybuffer");
      const fileName = `arrivals_report_${filterFrom}_${filterTo}.pdf`;
      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: "Arrivals Report", uri: saved.uri });
      } else {
        doc.save(fileName);
        toast({ title: "Arrivals Report PDF downloaded" });
      }
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const buildPaymentsReportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40;
    const right = pageW - 40;
    let y = 48;
    const lineH = 14;
    const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };

    const restaurantName = settings?.restaurantName ?? "SANGI POS";
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("Payments Report", left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

    let grandTotal = 0;
    let totalCash = 0;
    let totalBank = 0;

    for (const sup of suppliers) {
      const supPayments = payments
        .filter((p) => p.supplierId === sup.id && p.createdAt >= fromTs && p.createdAt <= toTs)
        .sort((a, b) => a.createdAt - b.createdAt);
      if (supPayments.length === 0) continue;

      const supTotal = supPayments.reduce((s, p) => s + p.amount, 0);
      grandTotal += supTotal;
      supPayments.forEach((p) => { if (p.paymentType === "bank") totalBank += p.amount; else totalCash += p.amount; });

      const currentBalance = getSupplierBalance(sup);

      checkPage(60 + supPayments.length * lineH);
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text(sup.name, left, y);
      doc.text(`Current Balance: ${formatIntMoney(currentBalance)}`, right, y, { align: "right" }); y += 14;

      // Calculate balance before range: current + payments in range (they reduced balance) - arrivals after range would be complex
      // Simpler: work backwards from current balance
      // balance after last payment in range = currentBalance + sum of payments AFTER range
      const paymentsAfterRange = payments.filter((p) => p.supplierId === sup.id && p.createdAt > toTs).reduce((s, p) => s + p.amount, 0);
      const arrivalsAfterRange = arrivals.filter((a) => a.supplierId === sup.id && a.createdAt > toTs).reduce((s, a) => s + a.total, 0);
      // Balance at end of range = currentBalance + paymentsAfterRange - arrivalsAfterRange
      const balanceAtEndOfRange = currentBalance + paymentsAfterRange - arrivalsAfterRange;
      // Work backwards from end of range for running balance
      let runningBal = balanceAtEndOfRange;
      const balAfter: number[] = [];
      for (let i = supPayments.length - 1; i >= 0; i--) {
        balAfter[i] = runningBal;
        runningBal += supPayments[i].amount; // before this payment, balance was higher
      }

      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("#", left + 4, y); doc.text("Amount", left + 30, y); doc.text("Type", left + 120, y); doc.text("Date", left + 180, y); doc.text("Balance After", right - 10, y, { align: "right" }); y += 10;
      doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0);

      supPayments.forEach((p, idx) => {
        checkPage();
        doc.setFontSize(8);
        doc.text(String(idx + 1), left + 4, y);
        doc.text(formatIntMoney(p.amount), left + 30, y);
        doc.text(p.paymentType ?? "cash", left + 120, y);
        doc.text(new Date(p.createdAt).toLocaleDateString(), left + 180, y);
        doc.text(formatIntMoney(balAfter[idx]), right - 10, y, { align: "right" });
        y += lineH;
      });
      y += 12;
    }

    // Summary
    checkPage(50);
    doc.setDrawColor(0); doc.line(left, y, right, y); y += 14;
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text("Grand Total Payments:", left, y); doc.text(formatIntMoney(grandTotal), right, y, { align: "right" }); y += 14;
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Cash: ${formatIntMoney(totalCash)}`, left, y); doc.text(`Bank: ${formatIntMoney(totalBank)}`, left + 150, y);

    return doc;
  };

  const sharePaymentsPdf = async () => {
    try {
      if (payments.length === 0) { toast({ title: "No payments to export", variant: "destructive" }); return; }
      const doc = buildPaymentsReportPdf();
      const bytes = doc.output("arraybuffer");
      const fileName = `payments_report_${filterFrom}_${filterTo}.pdf`;
      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: "Payments Report", uri: saved.uri });
      } else {
        doc.save(fileName);
        toast({ title: "Payments Report PDF downloaded" });
      }
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const buildSingleArrivalsPdf = (sup: Supplier) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40; const right = pageW - 40;
    let y = 48; const lineH = 14; const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };
    const restaurantName = settings?.restaurantName ?? "SANGI POS";

    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text(`Arrivals: ${sup.name}`, left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

    const supArrivals = arrivals.filter((a) => a.supplierId === sup.id && a.createdAt >= fromTs && a.createdAt <= toTs).sort((a, b) => a.createdAt - b.createdAt);
    const balance = getSupplierBalance(sup);
    const totalArrivalsInRange = supArrivals.reduce((s, a) => s + a.total, 0);

    // Running balance
    const paymentsAfterRange = payments.filter((p) => p.supplierId === sup.id && p.createdAt > toTs).reduce((s, p) => s + p.amount, 0);
    const arrivalsAfterRange = arrivals.filter((a) => a.supplierId === sup.id && a.createdAt > toTs).reduce((s, a) => s + a.total, 0);
    const balanceAtEndOfRange = balance + paymentsAfterRange - arrivalsAfterRange;
    let runningBal = balanceAtEndOfRange;
    const balAfter: number[] = [];
    for (let i = supArrivals.length - 1; i >= 0; i--) { balAfter[i] = runningBal; runningBal -= supArrivals[i].total; }

    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text(sup.name, left, y); doc.text(`Balance: ${formatIntMoney(balance)}`, right, y, { align: "right" }); y += 14;
    if (sup.contact) { doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100); doc.text(`Contact: ${sup.contact}`, left, y); y += 12; }
    doc.setFontSize(9); doc.setTextColor(0); doc.text(`Total Arrivals: ${formatIntMoney(totalArrivalsInRange)}`, left, y); y += 16;

    if (supArrivals.length > 0) {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("#", left + 4, y); doc.text("Item", left + 20, y); doc.text("Qty", left + 130, y); doc.text("Price", left + 180, y); doc.text("Total", left + 240, y); doc.text("Date", left + 320, y); doc.text("Bal After", right - 10, y, { align: "right" }); y += 10;
      doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0);
      supArrivals.forEach((a, idx) => {
        checkPage(); doc.setFontSize(8);
        doc.text(String(idx + 1), left + 4, y);
        doc.text((a.itemName ?? "").slice(0, 16), left + 20, y);
        doc.text(`${a.qty} ${a.unit || ""}`, left + 130, y);
        doc.text(formatIntMoney(a.unitPrice), left + 180, y);
        doc.text(formatIntMoney(a.total), left + 240, y);
        doc.text(new Date(a.createdAt).toLocaleDateString(), left + 320, y);
        doc.text(formatIntMoney(balAfter[idx]), right - 10, y, { align: "right" });
        y += lineH;
      });
    } else {
      doc.setFontSize(8); doc.setTextColor(120); doc.text("No arrivals in this period", left + 10, y); y += lineH;
    }
    return doc;
  };

  const shareSingleArrivalsPdf = async (sup: Supplier) => {
    try {
      const doc = buildSingleArrivalsPdf(sup);
      const bytes = doc.output("arraybuffer");
      const safeName = sup.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
      const fileName = `arrivals_${safeName}_${filterFrom}_${filterTo}.pdf`;
      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: `Arrivals: ${sup.name}`, uri: saved.uri });
      } else {
        doc.save(fileName);
        toast({ title: `${sup.name} Arrivals PDF downloaded` });
      }
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const shareSingleSupplierPdf = async (sup: Supplier) => {
    try {
      const doc = buildSingleSupplierPdf(sup);
      const bytes = doc.output("arraybuffer");
      const safeName = sup.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
      const fileName = `supplier_${safeName}_${filterFrom}_${filterTo}.pdf`;
      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: `Supplier Lodge: ${sup.name}`, uri: saved.uri });
      } else {
        doc.save(fileName);
        toast({ title: `${sup.name} PDF downloaded` });
      }
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const sharePartyPdf = async () => {
    try {
      if (suppliers.length === 0) { toast({ title: "No suppliers to export", variant: "destructive" }); return; }
      const doc = buildPartyPdf();
      const bytes = doc.output("arraybuffer");
      const fileName = `party_lodge_${filterFrom}_${filterTo}.pdf`;
      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: "Party Lodge Report", uri: saved.uri });
      } else {
        doc.save(fileName);
        toast({ title: "Party Lodge PDF downloaded" });
      }
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const handleArrivalImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const sup = importForSupplier;
      const res = sup
        ? await importArrivalsForSupplier(file, sup.id)
        : await importArrivalsFromExcel(file);
      await refresh();
      if (res.errors.length) toast({ title: `Imported ${res.imported} arrivals`, description: res.errors.join("\n"), variant: res.imported ? "default" : "destructive" });
      else toast({ title: `Imported ${res.imported} arrivals successfully` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message ?? String(err), variant: "destructive" });
    }
    e.target.value = "";
    setImportForSupplier(null);
  };

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Party Lodge</h1>
          <p className="text-sm text-muted-foreground">Manage suppliers & payments</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          Add Supplier
        </Button>
      </div>
      <input ref={arrivalFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleArrivalImport} />

      {/* Search */}
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search suppliers…" />

      {/* Supplier List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No suppliers yet. Add your first supplier.</CardContent></Card>
        ) : (
          filtered.map((sup) => {
            const balance = getSupplierBalance(sup);
            return (
              <Card key={sup.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{sup.name}</div>
                      {sup.contact && <div className="text-xs text-muted-foreground">Contact: {sup.contact}</div>}
                      {sup.itemName && <div className="text-xs text-muted-foreground">Item: {sup.itemName}{sup.stockUnit ? ` (${sup.stockUnit})` : ""}{sup.unitPrice ? ` @ ${formatIntMoney(sup.unitPrice)}` : ""}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Balance</div>
                      <div className={`text-sm font-bold ${balance > 0 ? "text-destructive" : "text-green-600"}`}>
                        {formatIntMoney(balance)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openArrivalDialog(sup)}>
                      <PackagePlus className="h-3 w-3 mr-1" />
                      Arrival
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openPayDialog(sup)}>
                      <CreditCard className="h-3 w-3 mr-1" />
                      Pay
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setSelectedId(sup.id)}>
                      History
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openEdit(sup)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => void shareSingleSupplierPdf(sup)}>
                      <Share2 className="h-3 w-3 mr-1" />
                      PDF
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => void shareSingleArrivalsPdf(sup)}>
                      <PackagePlus className="h-3 w-3 mr-1" />
                      Arrivals PDF
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => downloadPartyImportTemplate(sup.name)} title="Download import template">
                      <Download className="h-3 w-3 mr-1" />
                      Template
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setImportForSupplier(sup); arrivalFileRef.current?.click(); }} title="Import arrivals from Excel">
                      <Upload className="h-3 w-3 mr-1" />
                      Import
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={() => setDeleteTarget(sup)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* History for selected supplier */}
      {selectedSupplier && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">History: {selectedSupplier.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>✕</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Arrival History */}
            <div>
              <div className="text-sm font-semibold mb-2 flex items-center gap-1">
                <PackagePlus className="h-3.5 w-3.5" /> Arrivals
              </div>
              {selectedArrivals.length === 0 ? (
                <div className="text-sm text-muted-foreground">No arrivals recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {selectedArrivals.map((a, idx) => (
                    <div key={a.id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{selectedArrivals.length - idx}</span>
                          <span className="font-medium">{a.itemName}</span>
                        </div>
                        <span className="font-bold text-destructive">{formatIntMoney(a.total)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {a.qty} {a.unit || "units"} × {formatIntMoney(a.unitPrice)}
                      </div>
                      {a.note && <div className="text-xs text-muted-foreground">{a.note}</div>}
                      <div className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()} {new Date(a.createdAt).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment History */}
            <div>
              <div className="text-sm font-semibold mb-2 flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" /> Payments
              </div>
              {selectedPayments.length === 0 ? (
                <div className="text-sm text-muted-foreground">No payments recorded yet.</div>
              ) : (
                selectedPayments.map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{selectedPayments.length - idx}</span>
                        <span className="font-medium">{formatIntMoney(p.amount)}</span>
                        {p.paymentType === "bank" ? <Banknote className="h-3 w-3 text-muted-foreground" /> : <CreditCard className="h-3 w-3 text-muted-foreground" />}
                        <span className="text-xs text-muted-foreground">{p.paymentType ?? ""}</span>
                      </div>
                      {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
                      <div className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()} {new Date(p.createdAt).toLocaleTimeString()}</div>
                      {p.expenseId && <div className="text-xs text-primary">Recorded as expense</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Share PDF */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Share Party Lodge PDF</CardTitle>
          <CardDescription>Export all suppliers and payments as PDF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="plFrom" className="text-xs">From</Label>
              <Input id="plFrom" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plTo" className="text-xs">To</Label>
              <Input id="plTo" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void sharePartyPdf()} disabled={suppliers.length === 0}>
              <Share2 className="h-4 w-4 mr-1" />
              Share Full PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => void shareArrivalsPdf()} disabled={arrivals.length === 0}>
              <PackagePlus className="h-4 w-4 mr-1" />
              Share Arrivals PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => void sharePaymentsPdf()} disabled={payments.length === 0}>
              <CreditCard className="h-4 w-4 mr-1" />
              Share Payments PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Dialogs ─── */}

      {/* Add/Edit Supplier */}
      <Dialog open={supplierMode.open} onOpenChange={(v) => !v && setSupplierMode({ open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{supplierMode.open && supplierMode.supplier ? "Edit Supplier" : "New Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="supName">Supplier Name *</Label>
              <Input id="supName" value={sName} onChange={(e) => setSName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supContact">Contact (optional)</Label>
              <Input id="supContact" inputMode="tel" value={sContact} onChange={(e) => setSContact(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supItem">Item Supply Name (optional)</Label>
              <Input id="supItem" value={sItemName} onChange={(e) => setSItemName(e.target.value)} placeholder="e.g., Rice, Flour" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="supUnit">Unit (optional)</Label>
                <select id="supUnit" value={sUnit} onChange={(e) => setSUnit(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">None</option>
                  {STOCK_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supPrice">Unit Price (optional)</Label>
                <Input id="supPrice" inputMode="numeric" value={sUnitPrice === 0 ? "" : String(sUnitPrice)} onChange={(e) => setSUnitPrice(parseNonDecimalInt(e.target.value))} placeholder="0" />
              </div>
            </div>
            {supplierMode.open && !supplierMode.supplier ? (
              <div className="space-y-2">
                <Label htmlFor="supBalance">Total Balance (amount owed)</Label>
                <Input id="supBalance" inputMode="numeric" value={sBalance === 0 ? "" : String(sBalance)} onChange={(e) => setSBalance(parseNonDecimalInt(e.target.value))} placeholder="0" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="supAddBal">Add to Balance (increase amount owed)</Label>
                <Input id="supAddBal" inputMode="numeric" value={sAddBalance === 0 ? "" : String(sAddBalance)} onChange={(e) => setSAddBalance(parseNonDecimalInt(e.target.value))} placeholder="0" />
                <div className="text-xs text-muted-foreground">Current total balance: {formatIntMoney(supplierMode.open && supplierMode.supplier ? supplierMode.supplier.totalBalance : 0)}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierMode({ open: false })}>Cancel</Button>
            <Button onClick={() => void saveSupplier()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payMode.open} onOpenChange={(v) => !v && setPayMode({ open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay: {payMode.open ? payMode.supplier.name : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="payAmt">Amount</Label>
              <Input id="payAmt" inputMode="numeric" value={payAmount === 0 ? "" : String(payAmount)} onChange={(e) => setPayAmount(parseNonDecimalInt(e.target.value))} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Payment Type</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPayType("cash")} className={`flex-1 rounded-md border px-3 py-2 text-sm ${payType === "cash" ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"}`}>
                  Cash
                </button>
                <button type="button" onClick={() => setPayType("bank")} className={`flex-1 rounded-md border px-3 py-2 text-sm ${payType === "bank" ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"}`}>
                  Bank
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payNote">Note (optional)</Label>
              <Input id="payNote" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g., Monthly payment" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="payExpense" checked={payAsExpense} onChange={(e) => setPayAsExpense(e.target.checked)} className="rounded" />
              <Label htmlFor="payExpense" className="text-sm font-normal">Also record as Expense</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayMode({ open: false })}>Cancel</Button>
            <Button onClick={() => void savePayment()} disabled={payAmount <= 0}>Save Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{deleteTarget?.name}" and all payment records? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Arrival Dialog */}
      <Dialog open={arrivalMode.open} onOpenChange={(v) => !v && setArrivalMode({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Arrival: {arrivalMode.open ? arrivalMode.supplier.name : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {arrivalMode.open && (
              <>
                {arrivalItems.map((it, idx) => (
                  <div key={it.key} className="rounded-md border p-3 space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Item {idx + 1}</span>
                      {arrivalItems.length > 1 && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeArrivalItem(it.key)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Item Name (optional)</Label>
                      <Input value={it.itemName} onChange={(e) => updateArrivalItem(it.key, { itemName: e.target.value })} placeholder="e.g., Rice, Flour" className="h-8 text-sm" />
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id={`mt-${it.key}`} checked={it.useManualTotal} onChange={(e) => updateArrivalItem(it.key, { useManualTotal: e.target.checked })} className="rounded" />
                      <Label htmlFor={`mt-${it.key}`} className="text-xs font-normal">Enter total manually</Label>
                    </div>
                    {it.useManualTotal ? (
                      <div className="space-y-1">
                        <Label className="text-xs">Total Bill</Label>
                        <Input inputMode="numeric" value={it.manualTotal === 0 ? "" : String(it.manualTotal)} onChange={(e) => updateArrivalItem(it.key, { manualTotal: parseNonDecimalInt(e.target.value) })} placeholder="0" className="h-8 text-sm" />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Unit</Label>
                            <select value={it.unit} onChange={(e) => updateArrivalItem(it.key, { unit: e.target.value })} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                              <option value="">None</option>
                              {STOCK_UNITS.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Unit Price</Label>
                            <Input inputMode="numeric" value={it.unitPrice === 0 ? "" : String(it.unitPrice)} onChange={(e) => updateArrivalItem(it.key, { unitPrice: parseNonDecimalInt(e.target.value) })} placeholder="0" className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Qty ({it.unit || "units"})</Label>
                            <Input inputMode="numeric" value={it.qty === 0 ? "" : String(it.qty)} onChange={(e) => updateArrivalItem(it.key, { qty: parseNonDecimalInt(e.target.value) })} placeholder="0" className="h-8 text-sm" />
                          </div>
                        </div>
                      </>
                    )}
                    <div className="text-xs text-right font-semibold">
                      Subtotal: {formatIntMoney(getItemTotal(it))}
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addArrivalItem} className="w-full">
                  <Plus className="h-3 w-3 mr-1" /> Add Another Item
                </Button>
                <div className="space-y-2">
                  <Label htmlFor="arrNote">Note (optional)</Label>
                  <Input id="arrNote" value={arrivalNote} onChange={(e) => setArrivalNote(e.target.value)} placeholder="e.g., Weekly supply" />
                </div>
                <div className="rounded-md border p-3 bg-muted/50">
                  <div className="text-xs text-muted-foreground">Grand Total ({arrivalItems.length} item{arrivalItems.length > 1 ? "s" : ""})</div>
                  <div className="text-lg font-bold">{formatIntMoney(arrivalTotal)}</div>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-1.5">
            <Button variant="outline" onClick={() => setArrivalMode({ open: false })}>Cancel</Button>
            <Button variant="outline" onClick={() => void saveArrival("print")} disabled={arrivalTotal <= 0}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Save & Print
            </Button>
            <Button variant="outline" onClick={() => void saveArrival("share")} disabled={arrivalTotal <= 0}>
              <Share2 className="h-3.5 w-3.5 mr-1" /> Save & Share
            </Button>
            <Button onClick={() => void saveArrival()} disabled={arrivalTotal <= 0}>
              Add to Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} message={upgradeMsg} />

      {/* Export Party Section */}
      <div className="border-t pt-6 mt-6">
        <ExportPartySection />
      </div>
    </div>
  );
}
