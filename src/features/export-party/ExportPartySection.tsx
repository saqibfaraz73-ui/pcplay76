import React from "react";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { db } from "@/db/appDb";
import type { ExportCustomer, ExportSale, ExportPayment, Settings, MenuItem } from "@/db/schema";
import { STOCK_UNITS } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";
import { formatIntMoney, parseNonDecimalInt, fmtDate, fmtDateTime } from "@/features/pos/format";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { Capacitor } from "@capacitor/core";
import { Plus, Trash2, Share2, CreditCard, Banknote, PackagePlus, Upload, Download, Printer, XCircle, FileSpreadsheet } from "lucide-react";
import { printEntryReceipt, shareEntryReceipt, getNextEntryNo, type EntryReceiptData } from "@/features/pos/entry-receipt";
import { importExportSalesFromExcel, importSalesForCustomer, downloadImportTemplate, downloadPartyImportTemplate } from "@/features/party-import/party-import";
import { canMakeSale, incrementSaleCount } from "@/features/licensing/licensing-db";
import { AdRewardDialog } from "@/features/licensing/AdRewardDialog";
import * as XLSX from "xlsx";
import { downloadExcel } from "@/features/admin/products/menu-import-export";

type CustomerMode = { open: false } | { open: true; customer?: ExportCustomer };
type PayMode = { open: false } | { open: true; customer: ExportCustomer };
type SaleMode = { open: false } | { open: true; customer: ExportCustomer };

type SaleItem = {
  key: string;
  itemName: string;
  qty: number;
  unitPrice: number;
  unit: string;
  manualTotal: number;
  useManualTotal: boolean;
};

const makeEmptySaleItem = (): SaleItem => ({
  key: makeId("si"),
  itemName: "",
  qty: 0,
  unitPrice: 0,
  unit: "",
  manualTotal: 0,
  useManualTotal: false,
});

export function ExportPartySection() {
  const { toast } = useToast();

  const [customers, setCustomers] = React.useState<ExportCustomer[]>([]);
  const [sales, setSales] = React.useState<ExportSale[]>([]);
  const [payments, setPayments] = React.useState<ExportPayment[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [menuItems, setMenuItems] = React.useState<MenuItem[]>([]);

  const salesFileRef = React.useRef<HTMLInputElement>(null);
  const excelImportRef = React.useRef<HTMLInputElement>(null);
  const [importForCustomer, setImportForCustomer] = React.useState<ExportCustomer | null>(null);

  const [customerMode, setCustomerMode] = React.useState<CustomerMode>({ open: false });
  const [payMode, setPayMode] = React.useState<PayMode>({ open: false });
  const [saleMode, setSaleMode] = React.useState<SaleMode>({ open: false });
  const [deleteTarget, setDeleteTarget] = React.useState<ExportCustomer | null>(null);

  // Cancel entry state
  const [cancelTarget, setCancelTarget] = React.useState<{ id: string; total: number; customerId: string; discount?: number; advance?: number } | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");

  const [adOpen, setAdOpen] = React.useState(false);
  const [adMsg, setAdMsg] = React.useState("");
  const [adNeedsOnlineCheck, setAdNeedsOnlineCheck] = React.useState(false);

  // Customer form
  const [cName, setCName] = React.useState("");
  const [cContact, setCContact] = React.useState("");
  const [cWhatsapp, setCWhatsapp] = React.useState("");
  const [cEmail, setCEmail] = React.useState("");
  const [cItemName, setCItemName] = React.useState("");
  const [cUnit, setCUnit] = React.useState("");
  const [cUnitPrice, setCUnitPrice] = React.useState(0);
  const [cBalance, setCBalance] = React.useState(0);
  const [cAddBalance, setCAddBalance] = React.useState(0);

  // Payment form
  const [payAmount, setPayAmount] = React.useState(0);
  const [payType, setPayType] = React.useState<"cash" | "bank">("cash");
  const [payNote, setPayNote] = React.useState("");

  // Sale form (multi-item)
  const [saleItems, setSaleItems] = React.useState<SaleItem[]>([makeEmptySaleItem()]);
  const [saleNote, setSaleNote] = React.useState("");
  const [saleAdvancePayment, setSaleAdvancePayment] = React.useState(0);
  const [saleDiscount, setSaleDiscount] = React.useState(0);
  const [saleTaxEnabled, setSaleTaxEnabled] = React.useState(false);

  // PDF filter
  const toDateVal = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [filterFrom, setFilterFrom] = React.useState(toDateVal(Date.now() - 30 * 86400000));
  const [filterTo, setFilterTo] = React.useState(toDateVal(Date.now()));

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const refresh = React.useCallback(async () => {
    const [custs, sls, pays, s, items] = await Promise.all([
      db.exportCustomers.orderBy("createdAt").toArray(),
      db.exportSales.orderBy("createdAt").toArray(),
      db.exportPayments.orderBy("createdAt").toArray(),
      db.settings.get("app"),
      db.items.orderBy("name").toArray(),
    ]);
    setCustomers(custs);
    setSales(sls);
    setPayments(pays);
    setSettings(s ?? null);
    setMenuItems(items);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const getBalance = React.useCallback((cust: ExportCustomer) => {
    const totalPaid = payments.filter((p) => p.customerId === cust.id).reduce((s, p) => s + p.amount, 0);
    return cust.totalBalance - totalPaid;
  }, [payments]);

  const filtered = customers.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.contact ?? "").includes(q);
  });

  const selectedCustomer = customers.find((c) => c.id === selectedId);
  const selectedPayments = React.useMemo(
    () => payments.filter((p) => p.customerId === selectedId).sort((a, b) => b.createdAt - a.createdAt),
    [payments, selectedId],
  );
  const selectedSales = React.useMemo(
    () => sales.filter((s) => s.customerId === selectedId).sort((a, b) => b.createdAt - a.createdAt),
    [sales, selectedId],
  );

  // ─── Customer CRUD ───
  const openNew = () => {
    setCName(""); setCContact(""); setCWhatsapp(""); setCEmail(""); setCItemName(""); setCUnit(""); setCUnitPrice(0); setCBalance(0); setCAddBalance(0);
    setCustomerMode({ open: true });
  };

  const openEdit = (c: ExportCustomer) => {
    setCName(c.name); setCContact(c.contact ?? ""); setCWhatsapp(c.whatsapp ?? ""); setCEmail(c.email ?? ""); setCItemName(c.itemName ?? "");
    setCUnit(c.stockUnit ?? ""); setCUnitPrice(c.unitPrice ?? 0); setCBalance(c.totalBalance); setCAddBalance(0);
    setCustomerMode({ open: true, customer: c });
  };

  const saveCustomer = async () => {
    try {
      const name = cName.trim();
      if (!name) throw new Error("Name is required.");
      const isEdit = customerMode.open && customerMode.customer;

      if (!isEdit) {
        const check = await canMakeSale("partyLodge");
        if (!check.allowed) { setAdMsg(check.message); setAdNeedsOnlineCheck(!!check.needsOnlineVerification); setAdOpen(true); return; }
      }

      const now = Date.now();
      const existingBal = isEdit ? customerMode.customer!.totalBalance : 0;
      const newBal = isEdit ? existingBal + cAddBalance : cBalance;
      const next: ExportCustomer = {
        id: isEdit ? customerMode.customer!.id : makeId("exp"),
        name,
        contact: cContact.trim() || undefined,
        whatsapp: cWhatsapp.trim() || undefined,
        email: cEmail.trim() || undefined,
        itemName: cItemName.trim() || undefined,
        stockUnit: (cUnit as any) || undefined,
        unitPrice: cUnitPrice || undefined,
        totalBalance: newBal,
        createdAt: isEdit ? customerMode.customer!.createdAt : now,
      };
      await db.exportCustomers.put(next);
      if (!isEdit) await incrementSaleCount("partyLodge");
      toast({ title: "Saved" });
      setCustomerMode({ open: false });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await db.transaction("rw", [db.exportCustomers, db.exportSales, db.exportPayments], async () => {
      await db.exportSales.where("customerId").equals(deleteTarget.id).delete();
      await db.exportPayments.where("customerId").equals(deleteTarget.id).delete();
      await db.exportCustomers.delete(deleteTarget.id);
    });
    toast({ title: "Deleted" });
    setDeleteTarget(null);
    if (selectedId === deleteTarget.id) setSelectedId(null);
    await refresh();
  };

  // ─── Payment ───
  const openPayDialog = (cust: ExportCustomer) => {
    setPayAmount(0); setPayType("cash"); setPayNote("");
    setPayMode({ open: true, customer: cust });
  };

  const savePayment = async () => {
    if (!payMode.open) return;
    try {
      if (payAmount <= 0) throw new Error("Amount must be > 0");
      const payment: ExportPayment = {
        id: makeId("epay"),
        customerId: payMode.customer.id,
        amount: payAmount,
        paymentType: payType,
        note: payNote.trim() || undefined,
        createdAt: Date.now(),
      };
      await db.exportPayments.put(payment);
      toast({ title: "Payment recorded" });
      setPayMode({ open: false });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // ─── Sale (multi-item) ───
  const openSaleDialog = (cust: ExportCustomer) => {
    setSaleItems([{
      ...makeEmptySaleItem(),
      itemName: cust.itemName ?? "",
      unitPrice: cust.unitPrice ?? 0,
      unit: cust.stockUnit ?? "",
    }]);
    setSaleNote("");
    setSaleAdvancePayment(0);
    setSaleDiscount(0);
    setSaleTaxEnabled(false);
    setSaleMode({ open: true, customer: cust });
  };

  const updateSaleItem = (key: string, patch: Partial<SaleItem>) => {
    setSaleItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };
  const removeSaleItem = (key: string) => {
    setSaleItems((prev) => prev.length > 1 ? prev.filter((it) => it.key !== key) : prev);
  };
  const addSaleItem = () => setSaleItems((prev) => [...prev, makeEmptySaleItem()]);
  const getItemTotal = (it: SaleItem) => it.useManualTotal ? it.manualTotal : it.qty * it.unitPrice;

  const saleTotal = React.useMemo(() => {
    if (!saleMode.open) return 0;
    return saleItems.reduce((sum, it) => sum + getItemTotal(it), 0);
  }, [saleMode.open, saleItems]);

  const saleAfterDiscount = React.useMemo(() => Math.max(0, saleTotal - saleDiscount), [saleTotal, saleDiscount]);
  const saleTaxAmount = React.useMemo(() => {
    if (!saleTaxEnabled || !settings?.taxEnabled || !settings.taxValue) return 0;
    if (settings.taxType === "percent") return Math.round(saleAfterDiscount * settings.taxValue / 100);
    return Math.round(settings.taxValue);
  }, [saleTaxEnabled, settings, saleAfterDiscount]);
  const saleAfterTax = saleAfterDiscount + saleTaxAmount;
  const saleRemainingBalance = React.useMemo(() => Math.max(0, saleAfterTax - saleAdvancePayment), [saleAfterTax, saleAdvancePayment]);

  const buildSaleReceiptData = (): EntryReceiptData | null => {
    if (!saleMode.open) return null;
    const validItems = saleItems.filter((it) => it.useManualTotal ? it.manualTotal > 0 : (it.qty > 0 && it.unitPrice > 0));
    if (validItems.length === 0) return null;
    return {
      type: "sale",
      partyName: saleMode.customer.name,
      lines: validItems.map((it) => ({
        itemName: it.itemName.trim() || saleMode.customer.itemName || "—",
        qty: it.qty,
        unit: it.unit || undefined,
        unitPrice: it.unitPrice,
        total: getItemTotal(it),
      })),
      grandTotal: saleTotal,
      note: saleNote.trim() || undefined,
      date: new Date(),
    };
  };

  const shareSaleOnly = async () => {
    try {
      const receiptData = buildSaleReceiptData();
      if (!receiptData) throw new Error("Add at least one item with valid amounts");
      await shareEntryReceipt(receiptData);
      toast({ title: "Entry shared (not added to balance)" });
    } catch (e: any) {
      toast({ title: "Share failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const saveSale = async (postAction?: "print") => {
    if (!saleMode.open) return;
    try {
      const validItems = saleItems.filter((it) => it.useManualTotal ? it.manualTotal > 0 : (it.qty > 0 && it.unitPrice > 0));
      if (validItems.length === 0) throw new Error("Add at least one item with valid amounts");
      const cust = saleMode.customer;
      let totalAdded = 0;

      const entryNo = await getNextEntryNo("exportSale");
      const receiptData = buildSaleReceiptData();
      if (receiptData) receiptData.receiptNo = entryNo;

      // Net amount to add to balance = total - discount + tax (advance is handled via payment record)
      const netTotal = saleAfterTax;

      await db.transaction("rw", [db.exportCustomers, db.exportSales, db.exportPayments], async () => {
        let isFirst = true;
        for (const it of validItems) {
          const total = getItemTotal(it);
          totalAdded += total;
          const sale: ExportSale = {
            id: makeId("esal"),
            customerId: cust.id,
            receiptNo: entryNo,
            itemName: it.itemName.trim() || cust.itemName || "—",
            qty: it.qty,
            unit: it.unit || undefined,
            unitPrice: it.unitPrice,
            total,
            // Store advance/discount on first item only to avoid double-counting
            advancePayment: isFirst ? (saleAdvancePayment || undefined) : undefined,
            discountAmount: isFirst ? (saleDiscount || undefined) : undefined,
            note: saleNote.trim() || undefined,
            createdAt: Date.now(),
          };
          await db.exportSales.put(sale);
          isFirst = false;
        }
        await db.exportCustomers.update(cust.id, { totalBalance: cust.totalBalance + netTotal });

        // Record advance payment in payment history so it shows up
        if (saleAdvancePayment > 0) {
          const advPay: ExportPayment = {
            id: makeId("epay"),
            customerId: cust.id,
            amount: saleAdvancePayment,
            paymentType: "cash",
            note: `Advance on Sale #${entryNo}`,
            createdAt: Date.now(),
          };
          await db.exportPayments.put(advPay);
        }
      });

      toast({ title: `Sale #${entryNo} recorded`, description: `${validItems.length} item(s) totalling ${formatIntMoney(totalAdded)}${saleDiscount ? `, Discount: ${formatIntMoney(saleDiscount)}` : ""}${saleAdvancePayment ? `, Advance: ${formatIntMoney(saleAdvancePayment)}` : ""}` });
      setSaleMode({ open: false });
      await refresh();

      if (receiptData && postAction === "print") {
        try { await printEntryReceipt(receiptData); } catch (pe: any) {
          toast({ title: "Print failed", description: pe?.message ?? String(pe), variant: "destructive" });
        }
      }
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // Helper to build receipt data from a saved sale for reprinting
  const buildReceiptFromSale = (s: ExportSale, customerName: string): EntryReceiptData => ({
    type: "sale",
    receiptNo: s.receiptNo,
    partyName: customerName,
    lines: [{ itemName: s.itemName, qty: s.qty, unit: s.unit, unitPrice: s.unitPrice, total: s.total }],
    grandTotal: s.total,
    discountAmount: s.discountAmount,
    advancePayment: s.advancePayment,
    remainingBalance: (s.advancePayment ?? 0) > 0 || (s.discountAmount ?? 0) > 0
      ? s.total - (s.discountAmount ?? 0) - (s.advancePayment ?? 0)
      : undefined,
    note: s.note,
    date: new Date(s.createdAt),
  });

  // ─── Cancel Sale ───
  const confirmCancelSale = async () => {
    if (!cancelTarget) return;
    try {
      const reason = cancelReason.trim();
      if (!reason) throw new Error("Please enter a reason for cancellation");
      // The balance added was total - discount, so reverse that (advance payment record handles separately)
      const reverseAmount = cancelTarget.total - (cancelTarget.discount ?? 0);
      await db.transaction("rw", [db.exportSales, db.exportCustomers], async () => {
        await db.exportSales.update(cancelTarget.id, {
          cancelled: true,
          cancelledReason: reason,
        });
        const cust = await db.exportCustomers.get(cancelTarget.customerId);
        if (cust) {
          await db.exportCustomers.update(cancelTarget.customerId, {
            totalBalance: cust.totalBalance - reverseAmount,
          });
        }
      });
      toast({ title: "Sale cancelled", description: `Balance reduced by ${formatIntMoney(reverseAmount)}` });
      setCancelTarget(null);
      setCancelReason("");
      await refresh();
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // ─── PDF ───
  const buildExportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40; const right = pageW - 40;
    let y = 48; const lineH = 14; const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };
    const restaurantName = settings?.restaurantName ?? "SANGI POS";

    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("Export Party Report", left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

    for (const cust of customers) {
      const custSales = sales.filter((s) => s.customerId === cust.id && s.createdAt >= fromTs && s.createdAt <= toTs).sort((a, b) => a.createdAt - b.createdAt);
      const custPayments = payments.filter((p) => p.customerId === cust.id && p.createdAt >= fromTs && p.createdAt <= toTs).sort((a, b) => a.createdAt - b.createdAt);
      const balance = getBalance(cust);
      const totalSalesInRange = custSales.reduce((s, a) => s + a.total, 0);
      const totalPaymentsInRange = custPayments.reduce((s, p) => s + p.amount, 0);

      // Combined ledger (chronological)
      type LEntry = { type: "sale"; sale: typeof custSales[0]; date: number } | { type: "payment"; payment: typeof custPayments[0]; date: number };
      const ledger: LEntry[] = [
        ...custSales.map((s) => ({ type: "sale" as const, sale: s, date: s.createdAt })),
        ...custPayments.map((p) => ({ type: "payment" as const, payment: p, date: p.createdAt })),
      ].sort((a, b) => a.date - b.date);

      // Running balance
      const paymentsAfterRange = payments.filter((p) => p.customerId === cust.id && p.createdAt > toTs).reduce((s, p) => s + p.amount, 0);
      const salesAfterRange = sales.filter((s) => s.customerId === cust.id && s.createdAt > toTs).reduce((s, a) => s + a.total, 0);
      const balanceAtEndOfRange = balance + paymentsAfterRange - salesAfterRange;
      const balanceBeforeRange = balanceAtEndOfRange - totalSalesInRange + totalPaymentsInRange;
      let runBal = balanceBeforeRange;
      const balAfter: number[] = [];
      for (let i = 0; i < ledger.length; i++) {
        if (ledger[i].type === "sale") runBal += (ledger[i] as any).sale.total;
        else runBal -= (ledger[i] as any).payment.amount;
        balAfter[i] = runBal;
      }

      checkPage(60 + ledger.length * lineH);
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text(cust.name, left, y);
      doc.text(`Current Balance: ${formatIntMoney(balance)}`, right, y, { align: "right" }); y += 14;

      if (cust.contact) { doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100); doc.text(`Contact: ${cust.contact}`, left, y); y += 10; }
      if (cust.itemName) { doc.setFontSize(8); doc.text(`Item: ${cust.itemName}`, left, y); y += 10; }
      doc.setFontSize(9); doc.setTextColor(0);
      doc.text(`Total Sales: ${formatIntMoney(totalSalesInRange)}`, left, y);
      doc.text(`Total Paid: ${formatIntMoney(totalPaymentsInRange)}`, left + 150, y); y += 16;

      // Ledger header
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text("Ledger:", left + 4, y); y += 12;

      if (ledger.length > 0) {
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
        doc.text("#", left + 4, y); doc.text("Type", left + 20, y); doc.text("Details", left + 70, y); doc.text("Bill", left + 260, y); doc.text("Payment", left + 310, y); doc.text("Date", left + 370, y); doc.text("Balance", right - 10, y, { align: "right" }); y += 10;
        doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
        doc.setFont("helvetica", "normal"); doc.setTextColor(0);
        ledger.forEach((entry, idx) => {
          checkPage(); doc.setFontSize(8);
          doc.text(String(idx + 1), left + 4, y);
          if (entry.type === "sale") {
            const s = entry.sale;
            doc.setTextColor(0);
            doc.text("Sale", left + 20, y);
            doc.text(`${(s.itemName ?? "").slice(0, 20)} ${s.qty}${s.unit ? " " + s.unit : ""} @ ${formatIntMoney(s.unitPrice)}`, left + 70, y);
            doc.text(formatIntMoney(s.total), left + 260, y);
            doc.text("-", left + 310, y);
            doc.text(fmtDate(entry.date), left + 370, y);
          } else {
            const p = entry.payment;
            doc.setTextColor(0, 128, 0);
            doc.text("Payment", left + 20, y);
            doc.text(`${p.paymentType ?? "cash"}${p.note ? " - " + p.note.slice(0, 20) : ""}`, left + 70, y);
            doc.text("-", left + 260, y);
            doc.text(formatIntMoney(p.amount), left + 310, y);
            doc.text(fmtDate(entry.date), left + 370, y);
          }
          doc.setTextColor(0);
          doc.text(formatIntMoney(balAfter[idx]), right - 10, y, { align: "right" });
          y += lineH;
        });
      } else {
        doc.setFontSize(8); doc.setTextColor(120); doc.text("No records in this period", left + 10, y); y += lineH;
      }
      y += 16;
    }
    return doc;
  };

  const buildSalesPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40; const right = pageW - 40;
    let y = 48; const lineH = 14; const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };
    const restaurantName = settings?.restaurantName ?? "SANGI POS";

    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("Export Sales Report", left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();
    let grandTotal = 0;

    for (const cust of customers) {
      const custSales = sales.filter((s) => s.customerId === cust.id && s.createdAt >= fromTs && s.createdAt <= toTs).sort((a, b) => a.createdAt - b.createdAt);
      if (custSales.length === 0) continue;
      const supTotal = custSales.reduce((s, a) => s + a.total, 0);
      grandTotal += supTotal;

      const currentBalance = getBalance(cust);
      const paymentsAfterRange = payments.filter((p) => p.customerId === cust.id && p.createdAt > toTs).reduce((s, p) => s + p.amount, 0);
      const salesAfterRange = sales.filter((s) => s.customerId === cust.id && s.createdAt > toTs).reduce((s, a) => s + a.total, 0);
      const balanceAtEndOfRange = currentBalance + paymentsAfterRange - salesAfterRange;
      let runningBal = balanceAtEndOfRange;
      const balAfter: number[] = [];
      for (let i = custSales.length - 1; i >= 0; i--) {
        balAfter[i] = runningBal;
        runningBal -= custSales[i].total;
      }

      checkPage(40 + custSales.length * lineH);
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text(cust.name, left, y); doc.text(`Current Balance: ${formatIntMoney(currentBalance)}`, right, y, { align: "right" }); y += 14;

      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("#", left + 4, y); doc.text("Item", left + 20, y); doc.text("Qty", left + 120, y); doc.text("Total", left + 170, y); doc.text("Date", left + 240, y); doc.text("Bal After", right - 10, y, { align: "right" }); y += 10;
      doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0);
      custSales.forEach((s, idx) => {
        checkPage(); doc.setFontSize(8);
        doc.text(String(idx + 1), left + 4, y);
        doc.text((s.itemName ?? "").slice(0, 16), left + 20, y);
        doc.text(`${s.qty} ${s.unit || ""}`, left + 120, y);
        doc.text(formatIntMoney(s.total), left + 170, y);
        doc.text(fmtDate(s.createdAt), left + 240, y);
        doc.text(formatIntMoney(balAfter[idx]), right - 10, y, { align: "right" });
        y += lineH;
      });
      y += 12;
    }

    checkPage(30);
    doc.setDrawColor(0); doc.line(left, y, right, y); y += 14;
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text("Grand Total Sales:", left, y); doc.text(formatIntMoney(grandTotal), right, y, { align: "right" });
    return doc;
  };

  const buildPaymentsPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40; const right = pageW - 40;
    let y = 48; const lineH = 14; const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };
    const restaurantName = settings?.restaurantName ?? "SANGI POS";

    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("Export Payments Received", left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();
    let grandTotal = 0; let totalCash = 0; let totalBank = 0;

    for (const cust of customers) {
      const cp = payments.filter((p) => p.customerId === cust.id && p.createdAt >= fromTs && p.createdAt <= toTs).sort((a, b) => a.createdAt - b.createdAt);
      if (cp.length === 0) continue;
      const supTotal = cp.reduce((s, p) => s + p.amount, 0);
      grandTotal += supTotal;
      cp.forEach((p) => { if (p.paymentType === "bank") totalBank += p.amount; else totalCash += p.amount; });

      const currentBalance = getBalance(cust);
      const paymentsAfterRange = payments.filter((p) => p.customerId === cust.id && p.createdAt > toTs).reduce((s, p) => s + p.amount, 0);
      const salesAfterRange = sales.filter((s) => s.customerId === cust.id && s.createdAt > toTs).reduce((s, a) => s + a.total, 0);
      const balanceAtEndOfRange = currentBalance + paymentsAfterRange - salesAfterRange;
      let runningBal = balanceAtEndOfRange;
      const balAfter: number[] = [];
      for (let i = cp.length - 1; i >= 0; i--) {
        balAfter[i] = runningBal;
        runningBal += cp[i].amount; // before payment, balance was higher
      }

      checkPage(60 + cp.length * lineH);
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
      doc.text(cust.name, left, y); doc.text(`Current Balance: ${formatIntMoney(currentBalance)}`, right, y, { align: "right" }); y += 14;

      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("#", left + 4, y); doc.text("Amount", left + 30, y); doc.text("Type", left + 120, y); doc.text("Date", left + 180, y); doc.text("Bal After", right - 10, y, { align: "right" }); y += 10;
      doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0);
      cp.forEach((p, idx) => {
        checkPage(); doc.setFontSize(8);
        doc.text(String(idx + 1), left + 4, y);
        doc.text(formatIntMoney(p.amount), left + 30, y);
        doc.text(p.paymentType ?? "cash", left + 120, y);
        doc.text(fmtDate(p.createdAt), left + 180, y);
        doc.text(formatIntMoney(balAfter[idx]), right - 10, y, { align: "right" });
        y += lineH;
      });
      y += 12;
    }

    checkPage(50);
    doc.setDrawColor(0); doc.line(left, y, right, y); y += 14;
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text("Grand Total Received:", left, y); doc.text(formatIntMoney(grandTotal), right, y, { align: "right" }); y += 14;
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Cash: ${formatIntMoney(totalCash)}`, left, y); doc.text(`Bank: ${formatIntMoney(totalBank)}`, left + 150, y);
    return doc;
  };

  const buildSingleCustomerPdf = (cust: ExportCustomer) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40; const right = pageW - 40;
    let y = 48; const lineH = 14; const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };
    const restaurantName = settings?.restaurantName ?? "SANGI POS";

    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text(`Export Party: ${cust.name}`, left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

    const custSales = sales.filter((s) => s.customerId === cust.id && s.createdAt >= fromTs && s.createdAt <= toTs).sort((a, b) => a.createdAt - b.createdAt);
    const custPayments = payments.filter((p) => p.customerId === cust.id && p.createdAt >= fromTs && p.createdAt <= toTs).sort((a, b) => a.createdAt - b.createdAt);
    const balance = getBalance(cust);
    const totalSalesInRange = custSales.reduce((s, a) => s + a.total, 0);
    const totalPaidInRange = custPayments.reduce((s, p) => s + p.amount, 0);

    // Header info
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text(cust.name, left, y);
    doc.text(`Balance: ${formatIntMoney(balance)}`, right, y, { align: "right" }); y += 14;
    if (cust.contact) { doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100); doc.text(`Contact: ${cust.contact}`, left, y); y += 12; }
    if (cust.itemName) { doc.setFontSize(9); doc.text(`Item: ${cust.itemName}${cust.stockUnit ? ` (${cust.stockUnit})` : ""}${cust.unitPrice ? ` @ ${formatIntMoney(cust.unitPrice)}` : ""}`, left, y); y += 12; }
    doc.setFontSize(9); doc.setTextColor(0);
    doc.text(`Total Balance: ${formatIntMoney(cust.totalBalance)}`, left, y); y += 12;
    doc.text(`Total Sales: ${formatIntMoney(totalSalesInRange)}`, left, y);
    doc.text(`Total Paid: ${formatIntMoney(totalPaidInRange)}`, left + 150, y); y += 16;

    // Combined ledger (chronological)
    type LEntry = { type: "sale"; sale: ExportSale; date: number } | { type: "payment"; payment: ExportPayment; date: number };
    const ledger: LEntry[] = [
      ...custSales.map((s) => ({ type: "sale" as const, sale: s, date: s.createdAt })),
      ...custPayments.map((p) => ({ type: "payment" as const, payment: p, date: p.createdAt })),
    ].sort((a, b) => a.date - b.date);

    // No running balance – each entry shows its own bill/payment/balance

    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text("Ledger:", left + 4, y); y += 12;

    if (ledger.length > 0) {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("#", left + 4, y); doc.text("Type", left + 20, y); doc.text("Details", left + 70, y); doc.text("Bill", left + 260, y); doc.text("Payment", left + 310, y); doc.text("Date", left + 370, y); doc.text("Balance", right - 10, y, { align: "right" }); y += 10;
      doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0);
      ledger.forEach((entry, idx) => {
        checkPage(); doc.setFontSize(8);
        doc.text(String(idx + 1), left + 4, y);
        if (entry.type === "sale") {
          const s = entry.sale;
          const adv = s.advancePayment ?? 0;
          const disc = s.discountAmount ?? 0;
          const entryBal = s.total - disc - adv;
          doc.setTextColor(0);
          doc.text("Sale", left + 20, y);
          doc.text(`${(s.itemName ?? "").slice(0, 20)} ${s.qty}${s.unit ? " " + s.unit : ""} @ ${formatIntMoney(s.unitPrice)}`, left + 70, y);
          doc.text(formatIntMoney(s.total), left + 260, y);
          doc.text(adv > 0 ? formatIntMoney(adv) : "-", left + 310, y);
          doc.text(fmtDate(entry.date), left + 370, y);
          doc.text(formatIntMoney(entryBal), right - 10, y, { align: "right" });
        } else {
          const p = entry.payment;
          doc.setTextColor(0, 128, 0);
          doc.text("Payment", left + 20, y);
          doc.text(`${p.paymentType ?? "cash"}${p.note ? " - " + p.note.slice(0, 20) : ""}`, left + 70, y);
          doc.text("-", left + 260, y);
          doc.text(formatIntMoney(p.amount), left + 310, y);
          doc.text(fmtDate(entry.date), left + 370, y);
          doc.setTextColor(0);
          doc.text(`Paid`, right - 10, y, { align: "right" });
        }
        y += lineH;
      });
    } else {
      doc.setFontSize(8); doc.setTextColor(120); doc.text("No records in this period", left + 10, y); y += lineH;
    }
    return doc;
  };

  const buildSingleSalesPdf = (cust: ExportCustomer) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 40; const right = pageW - 40;
    let y = 48; const lineH = 14; const pageH = 780;
    const checkPage = (needed = lineH * 2) => { if (y + needed > pageH) { doc.addPage(); y = 48; } };
    const restaurantName = settings?.restaurantName ?? "SANGI POS";

    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text(`Sales: ${cust.name}`, left, y); y += 20;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${restaurantName} • ${filterFrom} → ${filterTo}`, left, y); y += 24;

    const [fy, fm, fd] = filterFrom.split("-").map(Number);
    const [ty, tm, td] = filterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

    const custSales = sales.filter((s) => s.customerId === cust.id && s.createdAt >= fromTs && s.createdAt <= toTs).sort((a, b) => a.createdAt - b.createdAt);
    const custPayments = payments.filter((p) => p.customerId === cust.id && p.createdAt >= fromTs && p.createdAt <= toTs).sort((a, b) => a.createdAt - b.createdAt);
    const balance = getBalance(cust);
    const totalSalesInRange = custSales.reduce((s, a) => s + a.total, 0);
    const totalPaidInRange = custPayments.reduce((s, p) => s + p.amount, 0);

    // Build combined ledger sorted by date
    type LedgerEntry = { type: "sale"; sale: ExportSale; date: number } | { type: "payment"; payment: ExportPayment; date: number };
    const ledger: LedgerEntry[] = [
      ...custSales.map((s) => ({ type: "sale" as const, sale: s, date: s.createdAt })),
      ...custPayments.map((p) => ({ type: "payment" as const, payment: p, date: p.createdAt })),
    ].sort((a, b) => a.date - b.date);

    // Running balance
    const paymentsAfterRange = payments.filter((p) => p.customerId === cust.id && p.createdAt > toTs).reduce((s, p) => s + p.amount, 0);
    const salesAfterRange = sales.filter((s) => s.customerId === cust.id && s.createdAt > toTs).reduce((s, a) => s + a.total, 0);
    const balanceAtEndOfRange = balance + paymentsAfterRange - salesAfterRange;
    let balBeforeRange = balanceAtEndOfRange - totalSalesInRange + totalPaidInRange;
    let runBal = balBeforeRange;
    const balAfter: number[] = [];
    for (let i = 0; i < ledger.length; i++) {
      if (ledger[i].type === "sale") runBal += (ledger[i] as any).sale.total;
      else runBal -= (ledger[i] as any).payment.amount;
      balAfter[i] = runBal;
    }

    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text(cust.name, left, y); doc.text(`Balance: ${formatIntMoney(balance)}`, right, y, { align: "right" }); y += 14;
    if (cust.contact) { doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100); doc.text(`Contact: ${cust.contact}`, left, y); y += 12; }
    doc.setFontSize(9); doc.setTextColor(0);
    doc.text(`Total Sales: ${formatIntMoney(totalSalesInRange)}`, left, y);
    doc.text(`Total Paid: ${formatIntMoney(totalPaidInRange)}`, left + 150, y); y += 16;

    if (ledger.length > 0) {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
      doc.text("#", left + 4, y); doc.text("Type", left + 20, y); doc.text("Details", left + 70, y); doc.text("Amount", left + 280, y); doc.text("Date", left + 350, y); doc.text("Balance", right - 10, y, { align: "right" }); y += 10;
      doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0);
      ledger.forEach((entry, idx) => {
        checkPage(); doc.setFontSize(8);
        doc.text(String(idx + 1), left + 4, y);
        if (entry.type === "sale") {
          const s = entry.sale;
          doc.setTextColor(0);
          doc.text("Sale", left + 20, y);
          doc.text(`${(s.itemName ?? "").slice(0, 20)} ${s.qty}${s.unit ? " " + s.unit : ""} @ ${formatIntMoney(s.unitPrice)}`, left + 70, y);
          doc.text(formatIntMoney(s.total), left + 280, y);
        } else {
          const p = entry.payment;
          doc.setTextColor(0, 128, 0);
          doc.text("Payment", left + 20, y);
          doc.text(`${p.paymentType ?? "cash"}${p.note ? " - " + p.note.slice(0, 20) : ""}`, left + 70, y);
          doc.text(`-${formatIntMoney(p.amount)}`, left + 280, y);
        }
        doc.setTextColor(0);
        doc.text(fmtDate(entry.date), left + 350, y);
        doc.text(formatIntMoney(balAfter[idx]), right - 10, y, { align: "right" });
        y += lineH;
      });
    } else {
      doc.setFontSize(8); doc.setTextColor(120); doc.text("No records in this period", left + 10, y); y += lineH;
    }
    return doc;
  };

  const saveSingleSalesPdf = async (cust: ExportCustomer, overrideName?: string) => {
    try {
      const doc = buildSingleSalesPdf(cust);
      const bytes = doc.output("arraybuffer");
      const safeName = cust.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
      const fileName = `sales_${safeName}_${filterFrom}_${filterTo}.pdf`;
      await savePdfBytes(new Uint8Array(bytes), overrideName ?? fileName);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const shareSingleSalesPdf = async (cust: ExportCustomer) => {
    try {
      const doc = buildSingleSalesPdf(cust);
      const bytes = doc.output("arraybuffer");
      const safeName = cust.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
      const fileName = `sales_${safeName}_${filterFrom}_${filterTo}.pdf`;
      await sharePdfBytes(new Uint8Array(bytes), fileName, `Sales: ${cust.name}`);
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const exportSingleCustomerExcel = async (cust: ExportCustomer) => {
    try {
      const custSales = sales.filter((s) => s.customerId === cust.id).sort((a, b) => a.createdAt - b.createdAt);
      const custPayments = payments.filter((p) => p.customerId === cust.id).sort((a, b) => a.createdAt - b.createdAt);
      const balance = getBalance(cust);
      const rows: (string | number)[][] = [["Type", "Item", "Qty", "Unit", "Unit Price", "Total/Amount", "Payment Type", "Note", "Date"]];
      for (const s of custSales) {
        rows.push(["Sale", s.itemName ?? "", s.qty, s.unit ?? "", s.unitPrice, s.total, "", s.note ?? "", fmtDate(s.createdAt)]);
      }
      for (const p of custPayments) {
        rows.push(["Payment", "", "", "", "", p.amount, p.paymentType ?? "cash", p.note ?? "", fmtDate(p.createdAt)]);
      }
      rows.push(["Balance", "", "", "", "", balance, "", "", ""]);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, cust.name.slice(0, 31));
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const safeName = cust.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
      await downloadExcel(blob, `${safeName}_ledger.xlsx`);
      toast({ title: `${cust.name} Excel exported` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const saveSingleCustomerPdf = async (cust: ExportCustomer) => {
    try {
      const doc = buildSingleCustomerPdf(cust);
      const bytes = doc.output("arraybuffer");
      const safeName = cust.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
      const fileName = `export_${safeName}_${filterFrom}_${filterTo}.pdf`;
      await savePdfBytes(new Uint8Array(bytes), fileName);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const shareSingleCustomerPdf = async (cust: ExportCustomer) => {
    try {
      const doc = buildSingleCustomerPdf(cust);
      const bytes = doc.output("arraybuffer");
      const safeName = cust.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
      const fileName = `export_${safeName}_${filterFrom}_${filterTo}.pdf`;
      await sharePdfBytes(new Uint8Array(bytes), fileName, `Export Party: ${cust.name}`);
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const exportExcel = async () => {
    try {
      if (customers.length === 0) { toast({ title: "No buyers to export", variant: "destructive" }); return; }
      const [fy, fm, fd] = filterFrom.split("-").map(Number);
      const [ty, tm, td] = filterTo.split("-").map(Number);
      const fromTs = new Date(fy, fm - 1, fd).getTime();
      const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

      const rows: (string | number)[][] = [["Buyer", "Type", "Item", "Qty", "Unit", "Unit Price", "Total/Amount", "Payment Type", "Note", "Date", "Balance"]];
      for (const cust of customers) {
        const custSales = sales.filter((s) => s.customerId === cust.id && s.createdAt >= fromTs && s.createdAt <= toTs);
        const custPayments = payments.filter((p) => p.customerId === cust.id && p.createdAt >= fromTs && p.createdAt <= toTs);
        const balance = getBalance(cust);
        for (const s of custSales) {
          rows.push([cust.name, "Sale", s.itemName ?? "", s.qty, s.unit ?? "", s.unitPrice, s.total, "", s.note ?? "", fmtDate(s.createdAt), ""]);
        }
        for (const p of custPayments) {
          rows.push([cust.name, "Payment", "", "", "", "", p.amount, p.paymentType ?? "cash", p.note ?? "", fmtDate(p.createdAt), ""]);
        }
        rows.push([cust.name, "Balance", "", "", "", "", "", "", "", "", balance]);
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Export Party");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      await downloadExcel(blob, `export_party_${filterFrom}_${filterTo}.xlsx`);
      toast({ title: "Export Party Excel exported" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const downloadTemplate = async () => {
    const headers = [["Buyer", "Type", "Item", "Qty", "Unit", "Unit Price", "Total/Amount", "Payment Type", "Note"]];
    const sample = [
      ["Ahmed Store", "Sale", "Flour", "100", "kg", "150", "15000", "", "Monthly order"],
      ["Ahmed Store", "Payment", "", "", "", "", "10000", "cash", "Partial payment"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const { shareFileBlob } = await import("@/features/pos/share-utils");
    await shareFileBlob(blob, "export_party_template.xlsx");
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rows.length < 2) throw new Error("Excel file is empty or has no data rows.");

      const now = Date.now();
      const existing = await db.exportCustomers.toArray();
      const custByName: Record<string, ExportCustomer> = Object.fromEntries(existing.map((c) => [c.name.toLowerCase(), c]));
      let customersCreated = 0, salesCreated = 0, paymentsCreated = 0;

      for (let i = 1; i < rows.length; i++) {
        const [buyerName, type, itemName, qty, unit, unitPrice, amount, paymentType, note] = rows[i].map((c: any) => (c ?? "").toString().trim());
        if (!buyerName) continue;

        let cust = custByName[buyerName.toLowerCase()];
        if (!cust) {
          cust = { id: makeId("exp"), name: buyerName, totalBalance: 0, createdAt: now };
          await db.exportCustomers.put(cust);
          custByName[buyerName.toLowerCase()] = cust;
          customersCreated++;
        }

        const rowType = (type || "").toLowerCase();
        if (rowType === "sale") {
          const total = parseInt(amount || "0", 10) || 0;
          const sale: ExportSale = {
            id: makeId("esal"), customerId: cust.id,
            itemName: itemName || "—", qty: parseInt(qty || "0", 10) || 0,
            unit: unit || undefined, unitPrice: parseInt(unitPrice || "0", 10) || 0,
            total, note: note || undefined, createdAt: now,
          };
          await db.exportSales.put(sale);
          await db.exportCustomers.update(cust.id, { totalBalance: (cust.totalBalance || 0) + total });
          cust.totalBalance = (cust.totalBalance || 0) + total;
          salesCreated++;
        } else if (rowType === "payment") {
          const amt = parseInt(amount || "0", 10) || 0;
          if (amt > 0) {
            const payment: ExportPayment = {
              id: makeId("epay"), customerId: cust.id, amount: amt,
              paymentType: (paymentType === "bank" ? "bank" : "cash") as any,
              note: note || undefined, createdAt: now,
            };
            await db.exportPayments.put(payment);
            paymentsCreated++;
          }
        }
      }
      await refresh();
      toast({ title: "Import complete", description: `${customersCreated} buyers, ${salesCreated} sales, ${paymentsCreated} payments imported` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message ?? String(err), variant: "destructive" });
    }
    e.target.value = "";
  };

  const savePdf = async (type: "full" | "sales" | "payments", overrideName?: string) => {
    try {
      const doc = type === "full" ? buildExportPdf() : type === "sales" ? buildSalesPdf() : buildPaymentsPdf();
      const bytes = doc.output("arraybuffer");
      const label = type === "full" ? "export_party" : type === "sales" ? "export_sales" : "export_payments";
      const fileName = `${label}_${filterFrom}_${filterTo}.pdf`;
      await savePdfBytes(new Uint8Array(bytes), overrideName ?? fileName);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const sharePdf = async (type: "full" | "sales" | "payments") => {
    try {
      const doc = type === "full" ? buildExportPdf() : type === "sales" ? buildSalesPdf() : buildPaymentsPdf();
      const bytes = doc.output("arraybuffer");
      const label = type === "full" ? "export_party" : type === "sales" ? "export_sales" : "export_payments";
      const fileName = `${label}_${filterFrom}_${filterTo}.pdf`;
      await sharePdfBytes(new Uint8Array(bytes), fileName, `Export ${type} Report`);
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // ─── Settings toggle ───
  const toggleReportInclusion = async () => {
    const current = settings?.showExportInReports ?? false;
    await db.settings.update("app", { showExportInReports: !current, updatedAt: Date.now() });
    await refresh();
    toast({ title: !current ? "Export sales will appear in reports" : "Export sales hidden from reports" });
  };

  const handleSalesImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const cust = importForCustomer;
      const res = cust
        ? await importSalesForCustomer(file, cust.id)
        : await importExportSalesFromExcel(file);
      await refresh();
      if (res.errors.length) toast({ title: `Imported ${res.imported} sales`, description: res.errors.join("\n"), variant: res.imported ? "default" : "destructive" });
      else toast({ title: `Imported ${res.imported} sales successfully` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message ?? String(err), variant: "destructive" });
    }
    e.target.value = "";
    setImportForCustomer(null);
  };

  // ─── Render ───
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Export Party</h2>
          <p className="text-xs text-muted-foreground">Wholesale buyers you sell to</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Buyer</Button>
      </div>
      <input ref={salesFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleSalesImport} />

      {/* Report toggle */}
      <div className="flex items-center gap-2 rounded-md border p-2">
        <input
          type="checkbox"
          id="showExportInReports"
          checked={settings?.showExportInReports ?? false}
          onChange={() => void toggleReportInclusion()}
          className="rounded"
        />
        <Label htmlFor="showExportInReports" className="text-sm font-normal">
          Show export sales in main reports
        </Label>
      </div>

      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search buyers…" />

      {/* Customer List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No export buyers yet.</CardContent></Card>
        ) : (
          filtered.map((cust) => {
            const balance = getBalance(cust);
            return (
              <Card key={cust.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{cust.name}</div>
                      {cust.contact && <div className="text-xs text-muted-foreground">Contact: {cust.contact}</div>}
                      {cust.whatsapp && <div className="text-xs text-muted-foreground">WhatsApp: {cust.whatsapp}</div>}
                      {cust.email && <div className="text-xs text-muted-foreground">Email: {cust.email}</div>}
                      {cust.itemName && <div className="text-xs text-muted-foreground">Item: {cust.itemName}{cust.stockUnit ? ` (${cust.stockUnit})` : ""}{cust.unitPrice ? ` @ ${formatIntMoney(cust.unitPrice)}` : ""}</div>}
                    </div>
                    <div className={`text-sm font-bold whitespace-nowrap ${balance > 0 ? "text-destructive" : "text-green-600"}`}>
                      {formatIntMoney(balance)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openSaleDialog(cust)}>
                      <PackagePlus className="h-3 w-3 mr-1" /> Sale
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openPayDialog(cust)}>
                      <CreditCard className="h-3 w-3 mr-1" /> Payment
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setSelectedId(cust.id)}>
                      History
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openEdit(cust)}>Edit</Button>
                    <SaveShareMenu label="Sales" size="sm" className="text-xs h-7" getDefaultFileName={() => { const s = cust.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30); return `sales_${s}_${filterFrom}_${filterTo}.pdf`; }} onSave={(fn) => void saveSingleSalesPdf(cust, fn)} onShare={() => void shareSingleSalesPdf(cust)} />
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => downloadPartyImportTemplate(cust.name)} title="Download import template">
                      <Download className="h-3 w-3 mr-1" /> Template
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setImportForCustomer(cust); salesFileRef.current?.click(); }} title="Import sales from Excel">
                      <Upload className="h-3 w-3 mr-1" /> Import
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={() => setDeleteTarget(cust)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* History */}
      {selectedCustomer && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">History: {selectedCustomer.name}</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => void exportSingleCustomerExcel(selectedCustomer)}>
                  <FileSpreadsheet className="h-3 w-3 mr-1" /> Excel
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>✕</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              // Build combined ledger sorted chronologically (newest first for display)
              type LedgerItem = { type: "sale"; sale: typeof selectedSales[0]; date: number } | { type: "payment"; payment: typeof selectedPayments[0]; date: number };
              const ledger: LedgerItem[] = [
                ...selectedSales.map((s) => ({ type: "sale" as const, sale: s, date: s.createdAt })),
                ...selectedPayments.map((p) => ({ type: "payment" as const, payment: p, date: p.createdAt })),
              ].sort((a, b) => b.date - a.date); // newest first

              // No running balance needed – each entry shows its own bill/payment/balance only

              if (ledger.length === 0) {
                return <div className="text-sm text-muted-foreground">No sales or payments recorded yet.</div>;
              }

              return (
                <div className="space-y-2">
                  {ledger.map((entry, idx) => {
                    if (entry.type === "sale") {
                      const s = entry.sale;
                      const rd = buildReceiptFromSale(s, selectedCustomer.name);
                      return (
                        <div key={s.id} className={`rounded-md border p-2 text-sm ${s.cancelled ? "opacity-60 bg-destructive/5 border-destructive/30" : ""}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <PackagePlus className="h-3 w-3 text-muted-foreground" />
                              {s.receiptNo ? (
                                <span className="text-xs font-bold text-primary">#{s.receiptNo}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sale</span>
                              )}
                              <span className="font-medium">{s.itemName}</span>
                              {s.cancelled && <span className="text-xs font-semibold text-destructive">CANCELLED</span>}
                            </div>
                            <span className={`font-bold ${s.cancelled ? "line-through text-muted-foreground" : "text-red-600"}`}>+{formatIntMoney(s.total)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{s.qty} {s.unit || "units"} × {formatIntMoney(s.unitPrice)}</div>
                          {(s.discountAmount ?? 0) > 0 && <div className="text-xs text-muted-foreground">Discount: {formatIntMoney(s.discountAmount!)}</div>}
                          {(s.advancePayment ?? 0) > 0 && <div className="text-xs font-medium text-primary">Advance: {formatIntMoney(s.advancePayment!)}</div>}
                          {(s.advancePayment ?? 0) > 0 && <div className="text-xs text-muted-foreground">Remaining: {formatIntMoney(s.total - (s.discountAmount ?? 0) - (s.advancePayment ?? 0))}</div>}
                          {s.note && <div className="text-xs text-muted-foreground">{s.note}</div>}
                          {s.cancelledReason && <div className="text-xs text-destructive">Reason: {s.cancelledReason}</div>}
                          <div className="flex items-center justify-between mt-1">
                            <div className="text-xs text-muted-foreground">{fmtDateTime(s.createdAt)}</div>
                            <div className="text-xs font-medium">Bal: {formatIntMoney(s.total - (s.discountAmount ?? 0) - (s.advancePayment ?? 0))}</div>
                          </div>
                          <div className="flex gap-1 mt-1.5">
                            <Button variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => void printEntryReceipt(rd).catch((e: any) => toast({ title: "Print failed", description: e?.message, variant: "destructive" }))}>
                              <Printer className="h-3 w-3 mr-1" /> Print
                            </Button>
                            <Button variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => void shareEntryReceipt(rd).catch((e: any) => toast({ title: "Share failed", description: e?.message, variant: "destructive" }))}>
                              <Share2 className="h-3 w-3 mr-1" /> Share
                            </Button>
                            {!s.cancelled && (
                              <Button variant="outline" size="sm" className="text-xs h-6 px-2 text-destructive hover:text-destructive" onClick={() => { setCancelReason(""); setCancelTarget({ id: s.id, total: s.total, customerId: s.customerId, discount: s.discountAmount, advance: s.advancePayment }); }}>
                                <XCircle className="h-3 w-3 mr-1" /> Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    } else {
                      const p = entry.payment;
                      return (
                        <div key={p.id} className="rounded-md border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30 p-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-3 w-3 text-green-600" />
                              <span className="text-xs font-semibold text-green-700 dark:text-green-400">PAYMENT</span>
                              {p.paymentType === "bank" ? <Banknote className="h-3 w-3 text-muted-foreground" /> : null}
                              <span className="text-xs text-muted-foreground">{p.paymentType ?? "cash"}</span>
                            </div>
                            <span className="font-bold text-green-600">-{formatIntMoney(p.amount)}</span>
                          </div>
                          {p.note && <div className="text-xs text-muted-foreground mt-1">{p.note}</div>}
                          <div className="flex items-center justify-between mt-1">
                            <div className="text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</div>
                            <div className="text-xs font-medium">Paid: {formatIntMoney(p.amount)}</div>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Share PDF */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Share Export Party PDF</CardTitle>
          <CardDescription>Export buyers, sales & payments as PDF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <SaveShareMenu label="Full PDF" getDefaultFileName={() => `export_party_${filterFrom}_${filterTo}.pdf`} onSave={(fn) => void savePdf("full", fn)} onShare={() => void sharePdf("full")} disabled={customers.length === 0} />
            <SaveShareMenu label="Sales PDF" getDefaultFileName={() => `export_sales_${filterFrom}_${filterTo}.pdf`} onSave={(fn) => void savePdf("sales", fn)} onShare={() => void sharePdf("sales")} disabled={sales.length === 0} />
            <SaveShareMenu label="Payments PDF" getDefaultFileName={() => `export_payments_${filterFrom}_${filterTo}.pdf`} onSave={(fn) => void savePdf("payments", fn)} onShare={() => void sharePdf("payments")} disabled={payments.length === 0} />
            <Button variant="outline" size="sm" onClick={() => void exportExcel()} disabled={customers.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" /> Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => excelImportRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> Import Excel
            </Button>
            <input ref={excelImportRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
          </div>
        </CardContent>
      </Card>

      {/* ─── Dialogs ─── */}

      {/* Add/Edit Customer */}
      <Dialog open={customerMode.open} onOpenChange={(v) => !v && setCustomerMode({ open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{customerMode.open && customerMode.customer ? "Edit Buyer" : "New Buyer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Buyer Name *</Label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact (optional)</Label>
              <Input inputMode="tel" value={cContact} onChange={(e) => setCContact(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp Number (optional)</Label>
              <Input inputMode="tel" value={cWhatsapp} onChange={(e) => setCWhatsapp(e.target.value)} placeholder="e.g., +923001234567" />
            </div>
            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="e.g., buyer@email.com" />
            </div>
            <div className="space-y-2">
              <Label>Item Name (optional)</Label>
              <Input value={cItemName} onChange={(e) => setCItemName(e.target.value)} placeholder="e.g., Rice, Flour" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Unit (optional)</Label>
                <select value={cUnit} onChange={(e) => setCUnit(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">None</option>
                  {STOCK_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Unit Price (optional)</Label>
                <Input inputMode="numeric" value={cUnitPrice === 0 ? "" : String(cUnitPrice)} onChange={(e) => setCUnitPrice(parseNonDecimalInt(e.target.value))} placeholder="0" />
              </div>
            </div>
            {customerMode.open && !customerMode.customer ? (
              <div className="space-y-2">
                <Label>Initial Balance (amount owed by buyer)</Label>
                <Input inputMode="numeric" value={cBalance === 0 ? "" : String(cBalance)} onChange={(e) => setCBalance(parseNonDecimalInt(e.target.value))} placeholder="0" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Add to Balance</Label>
                <Input inputMode="numeric" value={cAddBalance === 0 ? "" : String(cAddBalance)} onChange={(e) => setCAddBalance(parseNonDecimalInt(e.target.value))} placeholder="0" />
                <div className="text-xs text-muted-foreground">Current balance: {formatIntMoney(customerMode.open && customerMode.customer ? customerMode.customer.totalBalance : 0)}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerMode({ open: false })}>Cancel</Button>
            <Button onClick={() => void saveCustomer()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payMode.open} onOpenChange={(v) => !v && setPayMode({ open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Payment: {payMode.open ? payMode.customer.name : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input inputMode="numeric" value={payAmount === 0 ? "" : String(payAmount)} onChange={(e) => setPayAmount(parseNonDecimalInt(e.target.value))} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Payment Type</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPayType("cash")} className={`flex-1 rounded-md border px-3 py-2 text-sm ${payType === "cash" ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"}`}>Cash</button>
                <button type="button" onClick={() => setPayType("bank")} className={`flex-1 rounded-md border px-3 py-2 text-sm ${payType === "bank" ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"}`}>Bank</button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g., Bank transfer" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayMode({ open: false })}>Cancel</Button>
            <Button onClick={() => void savePayment()} disabled={payAmount <= 0}>Save Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Dialog (multi-item) */}
      <Dialog open={saleMode.open} onOpenChange={(v) => !v && setSaleMode({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Sale: {saleMode.open ? saleMode.customer.name : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {saleMode.open && (
              <>
                {saleItems.map((it, idx) => (
                  <div key={it.key} className="rounded-md border p-3 space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Item {idx + 1}</span>
                      {saleItems.length > 1 && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeSaleItem(it.key)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Item Name (optional)</Label>
                      {menuItems.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            const selected = menuItems.find((m) => m.id === e.target.value);
                            if (selected) {
                              updateSaleItem(it.key, {
                                itemName: selected.name,
                                unitPrice: selected.price,
                              });
                            }
                          }}
                          className="h-8 w-full rounded-md border bg-background px-2 text-xs mb-1"
                        >
                          <option value="">— Pick from menu —</option>
                          {menuItems.map((m) => (
                            <option key={m.id} value={m.id}>{m.name} ({formatIntMoney(m.price)})</option>
                          ))}
                        </select>
                      )}
                      <Input value={it.itemName} onChange={(e) => updateSaleItem(it.key, { itemName: e.target.value })} placeholder="e.g., Rice" className="h-8 text-sm" />
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id={`emt-${it.key}`} checked={it.useManualTotal} onChange={(e) => updateSaleItem(it.key, { useManualTotal: e.target.checked })} className="rounded" />
                      <Label htmlFor={`emt-${it.key}`} className="text-xs font-normal">Enter total manually</Label>
                    </div>
                    {it.useManualTotal ? (
                      <div className="space-y-1">
                        <Label className="text-xs">Total Bill</Label>
                        <Input inputMode="numeric" value={it.manualTotal === 0 ? "" : String(it.manualTotal)} onChange={(e) => updateSaleItem(it.key, { manualTotal: parseNonDecimalInt(e.target.value) })} placeholder="0" className="h-8 text-sm" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Unit</Label>
                          <select value={it.unit} onChange={(e) => updateSaleItem(it.key, { unit: e.target.value })} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                            <option value="">None</option>
                            {STOCK_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unit Price</Label>
                          <Input inputMode="numeric" value={it.unitPrice === 0 ? "" : String(it.unitPrice)} onChange={(e) => updateSaleItem(it.key, { unitPrice: parseNonDecimalInt(e.target.value) })} placeholder="0" className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Qty ({it.unit || "units"})</Label>
                          <Input inputMode="numeric" value={it.qty === 0 ? "" : String(it.qty)} onChange={(e) => updateSaleItem(it.key, { qty: parseNonDecimalInt(e.target.value) })} placeholder="0" className="h-8 text-sm" />
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-right font-semibold">Subtotal: {formatIntMoney(getItemTotal(it))}</div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addSaleItem} className="w-full">
                  <Plus className="h-3 w-3 mr-1" /> Add Another Item
                </Button>
                <div className="space-y-2">
                  <Label>Note (optional)</Label>
                  <Input value={saleNote} onChange={(e) => setSaleNote(e.target.value)} placeholder="e.g., Weekly order" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Discount (optional)</Label>
                    <Input inputMode="numeric" value={saleDiscount === 0 ? "" : String(saleDiscount)} onChange={(e) => setSaleDiscount(parseNonDecimalInt(e.target.value))} placeholder="0" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Advance Payment (optional)</Label>
                    <Input inputMode="numeric" value={saleAdvancePayment === 0 ? "" : String(saleAdvancePayment)} onChange={(e) => setSaleAdvancePayment(parseNonDecimalInt(e.target.value))} placeholder="0" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="rounded-md border p-3 bg-muted/50 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Grand Total ({saleItems.length} item{saleItems.length > 1 ? "s" : ""})</span>
                    <span className="font-semibold text-foreground">{formatIntMoney(saleTotal)}</span>
                  </div>
                  {saleDiscount > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Discount</span>
                      <span>-{formatIntMoney(saleDiscount)}</span>
                    </div>
                  )}
                  {saleDiscount > 0 && (
                    <div className="flex justify-between text-xs font-medium">
                      <span>After Discount</span>
                      <span>{formatIntMoney(saleAfterDiscount)}</span>
                    </div>
                  )}
                  {saleAdvancePayment > 0 && (
                    <div className="flex justify-between text-xs text-primary font-medium">
                      <span>Advance Payment</span>
                      <span>-{formatIntMoney(saleAdvancePayment)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold pt-1 border-t">
                    <span>Remaining Balance</span>
                    <span>{formatIntMoney(saleRemainingBalance)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-1.5">
            <Button variant="outline" onClick={() => setSaleMode({ open: false })}>Cancel</Button>
            <Button variant="outline" onClick={() => void saveSale("print")} disabled={saleTotal <= 0}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
            <Button variant="outline" onClick={() => void shareSaleOnly()} disabled={saleTotal <= 0}>
              <Share2 className="h-3.5 w-3.5 mr-1" /> Share
            </Button>
            <Button onClick={() => void saveSale()} disabled={saleTotal <= 0}>Add to Balance</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Buyer?</AlertDialogTitle>
            <AlertDialogDescription>Delete "{deleteTarget?.name}" and all records? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Sale Entry Confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) { setCancelTarget(null); setCancelReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Sale Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the entry as cancelled and reverse {cancelTarget ? formatIntMoney(cancelTarget.total) : ""} from the balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason for cancellation *</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g., Wrong entry, duplicate" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmCancelSale()} disabled={!cancelReason.trim()}>Cancel Entry</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdRewardDialog open={adOpen} onOpenChange={setAdOpen} module="partyLodge" message={adMsg} onRewarded={() => {}} needsOnlineVerification={adNeedsOnlineCheck} />
    </div>
  );
}
