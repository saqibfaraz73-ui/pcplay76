import React from "react";
import { FileNamePrompt } from "@/components/FileNamePrompt";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { sendToDefaultPrinter } from "@/features/pos/printer-routing";
import { isDuplicatePrint } from "@/features/pos/print-dedup";
import { formatIntMoney } from "@/features/pos/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/appDb";
import type { RecoveryCustomer, RecoveryPayment, StaffAccount, Settings, BillingFrequency } from "@/db/schema";
import { BILLING_FREQUENCIES } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import {
  Plus, Search, Upload, Download, FileSpreadsheet, Trash2, CheckCircle, XCircle,
  History, Printer, Share2, X, FileText, Users, SendHorizonal,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { Capacitor } from "@capacitor/core";
import jsPDF from "jspdf";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { RecoveryAgentExport } from "./RecoveryAgentExport";
import { RecoveryAgentView } from "./RecoveryAgentView";
import { RecoveryBackup } from "./RecoveryBackup";
import { calcGlobalTax, getTaxLabel } from "@/features/tax/tax-calc";
import { buildTaxQrEscPos, addTaxQrToPdf, shouldPrintTaxQr } from "@/features/tax/tax-qr";
import { canMakeSale, incrementSaleCount } from "@/features/licensing/licensing-db";
import { UpgradeDialog } from "@/features/licensing/UpgradeDialog";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

async function getNextReceiptNo(): Promise<number> {
  const counter = await db.counters.get("recoveryPayment");
  const next = counter?.next ?? 1;
  await db.counters.put({ id: "recoveryPayment", next: next + 1 });
  return next;
}

async function downloadFile(blob: Blob, fileName: string) {
  const { shareFileBlob } = await import("@/features/pos/share-utils");
  await shareFileBlob(blob, fileName);
}

export function RecoverySection() {
  const { toast } = useToast();
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const isCashier = session?.role === "cashier";
  const isRecovery = session?.role === "recovery";
  const agentName = session?.username ?? "Unknown";

  const [allCustomers, setAllCustomers] = React.useState<RecoveryCustomer[]>([]);
  const [payments, setPayments] = React.useState<RecoveryPayment[]>([]);
  const [agents, setAgents] = React.useState<StaffAccount[]>([]);
  const [businessName, setBusinessName] = React.useState("SANGI POS");
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [search, setSearch] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [agentCanAddCustomer, setAgentCanAddCustomer] = React.useState(false);

  // Agent filter for admin/cashier view
  const [selectedAgent, setSelectedAgent] = React.useState<string>("all");

  // Add/Edit form
  const [editId, setEditId] = React.useState<string | null>(null);
  const [formName, setFormName] = React.useState("");
  const [formContact, setFormContact] = React.useState("");
  const [formAddress, setFormAddress] = React.useState("");
  const [formPkg, setFormPkg] = React.useState("");
  const [formBill, setFormBill] = React.useState<number>(0);
  const [formBalance, setFormBalance] = React.useState<number>(0);
  const [formAgentId, setFormAgentId] = React.useState<string>("__none");
  const [formFrequency, setFormFrequency] = React.useState<BillingFrequency>("monthly");
  const [bulkAgentId, setBulkAgentId] = React.useState<string>("__none");

  // History view
  const [historyId, setHistoryId] = React.useState<string | null>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  // Report
  const [showReport, setShowReport] = React.useState(false);
  const [reportFrom, setReportFrom] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [showAgentView, setShowAgentView] = React.useState(false);
  const [reportTo, setReportTo] = React.useState(format(new Date(), "yyyy-MM-dd"));

  // Tax toggle per customer (keyed by customer id)
  const [taxEnabledMap, setTaxEnabledMap] = React.useState<Record<string, boolean>>({});
  const toggleTax = (custId: string) => setTaxEnabledMap(prev => ({ ...prev, [custId]: !prev[custId] }));

  // Upgrade dialog
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [upgradeMsg, setUpgradeMsg] = React.useState("");

  // Current month
  const currentMonth = format(new Date(), "yyyy-MM");

  const load = React.useCallback(async () => {
    const c = await db.recoveryCustomers.toArray();
    // Auto-accumulate balances based on billing frequency
    const now = Date.now();
    for (const cust of c) {
      const freq = cust.billingFrequency ?? "monthly";
      const intervalMs = freq === "daily" ? 24 * 60 * 60 * 1000
        : freq === "weekly" ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000; // monthly ~30 days
      const lastBilling = cust.lastBillingAt ?? cust.createdAt;
      const elapsed = now - lastBilling;
      const cycles = Math.floor(elapsed / intervalMs);
      if (cycles > 0 && cust.monthlyBill > 0) {
        const addAmount = cycles * cust.monthlyBill;
        const newBalance = cust.balance + addAmount;
        const newLastBilling = lastBilling + cycles * intervalMs;
        await db.recoveryCustomers.update(cust.id, { balance: newBalance, lastBillingAt: newLastBilling });
        cust.balance = newBalance;
        cust.lastBillingAt = newLastBilling;
      } else if (!cust.lastBillingAt) {
        // Initialize lastBillingAt for existing customers
        await db.recoveryCustomers.update(cust.id, { lastBillingAt: cust.createdAt });
        cust.lastBillingAt = cust.createdAt;
      }
    }
    const p = await db.recoveryPayments.toArray();
    const staff = await db.staffAccounts.where("role").equals("recovery").toArray();
    const s = await db.settings.get("app");
    setAllCustomers(c);
    setPayments(p);
    setAgents(staff);
    setSettings(s ?? null);
    if (s?.restaurantName) setBusinessName(s.restaurantName);
    setAgentCanAddCustomer(!!s?.recoveryAgentAddCustomerEnabled);
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  // For recovery agents, auto-detect their staffAccount id
  const [myAgentId, setMyAgentId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (isRecovery && agentName) {
      db.staffAccounts.where("role").equals("recovery").toArray().then(staff => {
        const me = staff.find(s => s.name.toLowerCase() === agentName.toLowerCase());
        setMyAgentId(me?.id ?? null);
      });
    }
  }, [isRecovery, agentName]);

  // Filter customers: recovery agents see only their own; admin/cashier can filter by agent
  const customers = React.useMemo(() => {
    if (isRecovery && myAgentId) {
      return allCustomers.filter(c => c.agentId === myAgentId);
    }
    if ((isAdmin || isCashier) && selectedAgent !== "all") {
      if (selectedAgent === "__unassigned") return allCustomers.filter(c => !c.agentId);
      return allCustomers.filter(c => c.agentId === selectedAgent);
    }
    return allCustomers;
  }, [allCustomers, isRecovery, myAgentId, isAdmin, isCashier, selectedAgent]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return customers;
    const s = search.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(s) || c.contact?.toLowerCase().includes(s) || c.address?.toLowerCase().includes(s) || c.pkg?.toLowerCase().includes(s));
  }, [customers, search]);

  const getCustomerPayments = (custId: string) => payments.filter(p => p.customerId === custId).sort((a, b) => b.createdAt - a.createdAt);

  const getCurrentMonthStatus = (custId: string): RecoveryPayment | undefined => {
    return payments.find(p => p.customerId === custId && p.month === currentMonth);
  };

  const resetForm = () => {
    setFormName(""); setFormContact(""); setFormAddress(""); setFormPkg(""); setFormBill(0); setFormBalance(0);
    setFormAgentId("__none"); setFormFrequency("monthly"); setEditId(null); setShowAdd(false);
  };

  const saveCustomer = async () => {
    if (!formName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const realAgentId = formAgentId === "__none" ? "" : formAgentId;
    const assignedAgent = agents.find(a => a.id === realAgentId);
    if (editId) {
      await db.recoveryCustomers.update(editId, {
        name: formName.trim(), contact: formContact.trim() || undefined, address: formAddress.trim() || undefined,
        pkg: formPkg.trim() || undefined, monthlyBill: formBill, balance: formBalance,
        billingFrequency: formFrequency,
        agentId: realAgentId || undefined, agentName: assignedAgent?.name || undefined,
      });
    } else {
      // License check for new customers
      const check = await canMakeSale("recovery");
      if (!check.allowed) {
        setUpgradeMsg(check.message);
        setUpgradeOpen(true);
        return;
      }
      // For recovery agents adding customers, auto-assign to themselves
      const effectiveAgentId = isRecovery && myAgentId ? myAgentId : realAgentId;
      const effectiveAgentName = isRecovery ? agentName : assignedAgent?.name;
      const now = Date.now();
      await db.recoveryCustomers.add({
        id: uid("rcust"), name: formName.trim(), contact: formContact.trim() || undefined, address: formAddress.trim() || undefined,
        pkg: formPkg.trim() || undefined, monthlyBill: formBill, balance: formBalance + formBill,
        billingFrequency: formFrequency, lastBillingAt: now,
        agentId: effectiveAgentId || undefined, agentName: effectiveAgentName || undefined,
        createdAt: now,
      });
    }
    toast({ title: editId ? "Customer updated" : "Customer added" });
    resetForm();
    void load();
  };

  const editCustomer = (c: RecoveryCustomer) => {
    setEditId(c.id); setFormName(c.name); setFormContact(c.contact ?? ""); setFormAddress(c.address ?? "");
    setFormPkg(c.pkg ?? ""); setFormBill(c.monthlyBill); setFormBalance(c.balance);
    setFormAgentId(c.agentId ?? "__none"); setFormFrequency(c.billingFrequency ?? "monthly"); setShowAdd(true);
  };

  const deleteCustomer = async (id: string) => {
    await db.recoveryCustomers.delete(id);
    await db.recoveryPayments.where("customerId").equals(id).delete();
    setDeleteId(null);
    toast({ title: "Customer deleted" });
    void load();
  };

  const markPaid = async (cust: RecoveryCustomer) => {
    const existing = getCurrentMonthStatus(cust.id);
    if (existing?.status === "paid") { toast({ title: "Already marked paid this month" }); return; }
    const receiptNo = await getNextReceiptNo();
    const isTaxOn = !!taxEnabledMap[cust.id];
    const taxAmt = isTaxOn ? calcGlobalTax(cust.monthlyBill, settings) : 0;
    const payment: RecoveryPayment = {
      id: uid("rpay"), customerId: cust.id, receiptNo, amount: cust.monthlyBill,
      taxAmount: taxAmt > 0 ? taxAmt : undefined,
      status: "paid", agentName, month: currentMonth, createdAt: Date.now(),
    };
    await db.recoveryPayments.add(payment);
    const newBalance = Math.max(0, cust.balance - cust.monthlyBill);
    await db.recoveryCustomers.update(cust.id, { balance: newBalance });
    toast({ title: `${cust.name} marked PAID${taxAmt > 0 ? ` + ${getTaxLabel(settings)} ${formatIntMoney(taxAmt)}` : ""}` });
    void load();
    void load();
  };

  const markUnpaid = async (cust: RecoveryCustomer) => {
    const existing = getCurrentMonthStatus(cust.id);
    if (existing?.status === "unpaid") { toast({ title: "Already marked unpaid this month" }); return; }
    const receiptNo = await getNextReceiptNo();
    const payment: RecoveryPayment = {
      id: uid("rpay"), customerId: cust.id, receiptNo, amount: 0,
      status: "unpaid", agentName, month: currentMonth, createdAt: Date.now(),
    };
    await db.recoveryPayments.add(payment);
    await db.recoveryCustomers.update(cust.id, { balance: cust.balance + cust.monthlyBill });
    toast({ title: `${cust.name} marked UNPAID — balance increased` });
    void load();
  };

  // ── Import Excel ──
  const importExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      let count = 0;
      // Determine which agent to assign to imported customers
      const importAgentId = isRecovery && myAgentId ? myAgentId : (bulkAgentId !== "__none" ? bulkAgentId : undefined);
      const importAgentName = isRecovery ? agentName : (importAgentId ? agents.find(a => a.id === importAgentId)?.name : undefined);
      for (const r of rows) {
        const name = String(r["Name"] || r["name"] || "").trim();
        if (!name) continue;
        const freq = String(r["Frequency"] || r["frequency"] || "monthly").trim().toLowerCase();
        const billingFrequency: BillingFrequency = (freq === "daily" || freq === "weekly" || freq === "monthly") ? freq : "monthly";
        const bill = Number(r["Monthly Bill"] || r["Bill"] || r["monthlyBill"] || r["monthly_bill"] || 0);
        const now = Date.now();
        await db.recoveryCustomers.add({
          id: uid("rcust"), name,
          contact: String(r["Contact"] || r["contact"] || r["Phone"] || r["phone"] || "").trim() || undefined,
          address: String(r["Address"] || r["address"] || "").trim() || undefined,
          pkg: String(r["Pkg"] || r["pkg"] || r["Package"] || r["package"] || "").trim() || undefined,
          monthlyBill: bill,
          billingFrequency,
          balance: Number(r["Balance"] || r["balance"] || 0) + bill,
          lastBillingAt: now,
          agentId: importAgentId || undefined,
          agentName: importAgentName || undefined,
          createdAt: now,
        });
        count++;
      }
      toast({ title: `${count} customers imported` });
      void load();
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  // ── Export Excel ──
  const exportExcel = async () => {
    const rows = customers.map(c => {
      const lastPay = payments.filter(p => p.customerId === c.id && p.status === "paid").sort((a, b) => b.createdAt - a.createdAt)[0];
      return {
        Name: c.name, Contact: c.contact ?? "", Address: c.address ?? "", Pkg: c.pkg ?? "",
        Frequency: c.billingFrequency ?? "monthly",
        "Bill Amount": c.monthlyBill, Balance: c.balance,
        Agent: c.agentName ?? "",
        "Last Payment": lastPay ? format(lastPay.createdAt, "dd/MM/yyyy") : "Never",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    await downloadFile(new Blob([buf]), `recovery_customers_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  // ── Export agent sales as JSON (shareable via WhatsApp) ──
  const [exportPromptOpen, setExportPromptOpen] = React.useState(false);
  const [exportDefaultName, setExportDefaultName] = React.useState("");
  const pendingExportBlob = React.useRef<Blob | null>(null);
  const [showAgentExport, setShowAgentExport] = React.useState(false);

  const startExportAgentSales = () => {
    const myCusts = customers;
    const myPayments = payments.filter(p => myCusts.some(c => c.id === p.customerId));
    const exportData = {
      type: "recovery-agent-export",
      version: 1,
      agentName: agentName,
      exportedAt: Date.now(),
      customers: myCusts,
      payments: myPayments,
    };
    const json = JSON.stringify(exportData, null, 2);
    pendingExportBlob.current = new Blob([json], { type: "application/json" });
    const defaultName = `recovery_${agentName.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.json`;
    setExportDefaultName(defaultName);
    setExportPromptOpen(true);
  };

  const confirmExport = async (fileName: string) => {
    setExportPromptOpen(false);
    if (!pendingExportBlob.current) return;
    await downloadFile(pendingExportBlob.current, fileName);
    const myCusts = customers;
    const myPayments = payments.filter(p => myCusts.some(c => c.id === p.customerId));
    toast({ title: `Exported ${myCusts.length} customers & ${myPayments.length} payments` });
    pendingExportBlob.current = null;
  };

  // ── Collect / Import agent data JSON ──
  const collectFileRef = React.useRef<HTMLInputElement>(null);
  const assignmentFileRef = React.useRef<HTMLInputElement>(null);
  const [collectStats, setCollectStats] = React.useState<{ imported: number; skipped: number; payments: number } | null>(null);

  const collectAgentData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    let totalImported = 0, totalSkipped = 0, totalPayments = 0;

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.type !== "recovery-agent-export") {
          toast({ title: `${file.name}: Not a valid agent export file`, variant: "destructive" });
          continue;
        }
        const importCusts: RecoveryCustomer[] = data.customers ?? [];
        const importPayments: RecoveryPayment[] = data.payments ?? [];

        // Get existing customer IDs and payment IDs for deduplication
        const existingCustIds = new Set((await db.recoveryCustomers.toArray()).map(c => c.id));
        const existingPayIds = new Set((await db.recoveryPayments.toArray()).map(p => p.id));

        for (const c of importCusts) {
          if (existingCustIds.has(c.id)) {
            // Update balance if the imported one has newer data
            const existing = await db.recoveryCustomers.get(c.id);
            if (existing && c.balance !== existing.balance) {
              await db.recoveryCustomers.update(c.id, { balance: c.balance, lastBillingAt: c.lastBillingAt });
            }
            totalSkipped++;
          } else {
            await db.recoveryCustomers.add(c);
            totalImported++;
          }
        }

        for (const p of importPayments) {
          if (!existingPayIds.has(p.id)) {
            await db.recoveryPayments.add(p);
            totalPayments++;
          }
        }
      } catch (err: any) {
        toast({ title: `${file.name}: Import failed`, description: err?.message, variant: "destructive" });
      }
    }

    setCollectStats({ imported: totalImported, skipped: totalSkipped, payments: totalPayments });
    toast({ title: `Collected: ${totalImported} new customers, ${totalPayments} payments (${totalSkipped} existing updated)` });
    void load();
    e.target.value = "";
  };

  // ── Import agent assignment file (agent device) ──
  const handleAgentAssignmentImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.type !== "recovery_agent_assignment") {
        toast({ title: "Not a valid recovery agent assignment file", variant: "destructive" });
        return;
      }

      let custCount = 0, payCount = 0;

      // Auto-create agent staff account with deterministic ID
      if (data.agentAccount) {
        const acc = data.agentAccount;
        const deterministicId = `agent_${acc.name.toLowerCase().replace(/\s+/g, "_")}_${acc.pin}`;
        const existing = await db.staffAccounts.get(deterministicId);
        if (!existing) {
          await db.staffAccounts.put({
            id: deterministicId,
            name: acc.name,
            phone: acc.phone || undefined,
            role: acc.role || "recovery",
            pin: acc.pin,
            createdAt: Date.now(),
          });
          toast({ title: `Agent account "${acc.name}" created. Login with PIN: ${acc.pin}` });
        }
        // Remap customer agentId from original admin ID to deterministic ID
        const originalAgentId = data.agentId;
        for (const c of (data.customers ?? [])) {
          if (c.agentId === originalAgentId) {
            c.agentId = deterministicId;
          }
        }
      }

      const importCustomers: RecoveryCustomer[] = data.customers ?? [];
      const importPayments: RecoveryPayment[] = data.payments ?? [];

      for (const c of importCustomers) {
        const existing = await db.recoveryCustomers.get(c.id);
        if (!existing) {
          await db.recoveryCustomers.add(c);
          custCount++;
        } else {
          // Update customer data but preserve local changes
          await db.recoveryCustomers.update(c.id, {
            name: c.name, contact: c.contact, address: c.address,
            pkg: c.pkg, monthlyBill: c.monthlyBill, billingFrequency: c.billingFrequency,
            agentId: c.agentId, agentName: c.agentName,
          });
        }
      }

      for (const p of importPayments) {
        const existing = await db.recoveryPayments.get(p.id);
        if (!existing) {
          await db.recoveryPayments.add(p);
          payCount++;
        }
      }

      toast({ title: `Imported ${custCount} new customers, ${payCount} payments` });
      void load();
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  // ── Share/Print receipt ──
  const shareReceipt = async (cust: RecoveryCustomer, pay: RecoveryPayment) => {
    const doc = new jsPDF({ unit: "mm", format: [80, 150] });
    doc.setFontSize(12);
    doc.text(businessName, 40, 8, { align: "center" });
    doc.setFontSize(10);
    doc.text("PAYMENT RECEIPT", 40, 14, { align: "center" });
    doc.setFontSize(9);
    let y = 22;
    const lines = [
      `Receipt #: ${pay.receiptNo ?? "N/A"}`,
      `Customer: ${cust.name}`,
      `Package: ${cust.pkg ?? "N/A"}`,
      `Amount: ${pay.amount}`,
      ...(pay.taxAmount ? [`${getTaxLabel(settings)}: ${formatIntMoney(pay.taxAmount)}`] : []),
      ...(pay.taxAmount ? [`Total: ${formatIntMoney(pay.amount + pay.taxAmount)}`] : []),
      `Status: ${pay.status.toUpperCase()}`,
      `Month: ${pay.month}`,
      `Agent: ${pay.agentName}`,
      `Date: ${format(pay.createdAt, "dd/MM/yyyy hh:mm a")}`,
    ];
    for (const l of lines) { doc.text(l, 5, y); y += 6; }

    // Tax QR in PDF
    if (settings && shouldPrintTaxQr(settings)) {
      y = await addTaxQrToPdf({
        doc, settings, receiptNo: pay.receiptNo ?? 0,
        taxAmount: pay.taxAmount ?? 0, total: pay.amount + (pay.taxAmount ?? 0), createdAt: pay.createdAt,
        x: 20, y: y + 2, size: 40,
      });
    }

    const fileName = `receipt_${pay.receiptNo ?? pay.id}.pdf`;
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    await sharePdfBytes(bytes, fileName, `Receipt - ${cust.name}`);
  };

  const printReceipt = async (cust: RecoveryCustomer, pay: RecoveryPayment) => {
    if (isNativeAndroid()) {
      const s = await db.settings.get("app");
      if (!s) throw new Error("Settings not loaded. Configure printer first.");
      const width = s.paperSize === "80" ? 48 : 32;
      const hr = "-".repeat(width);
      const CENTER_ON = "\x1ba\x01";
      const LEFT_ON = "\x1ba\x00";
      const lr = (l: string, r: string) => l.padEnd(width - r.length) + r;

      const out: string[] = [];
      out.push("\x1b@\x1b3\x14" + CENTER_ON);
      out.push(businessName);
      out.push("PAYMENT RECEIPT");
      out.push(hr);
      out.push(`Receipt #: ${pay.receiptNo ?? "N/A"}`);
      out.push(`Date: ${format(pay.createdAt, "dd/MM/yyyy hh:mm a")}`);
      out.push(LEFT_ON);
      out.push(hr);
      out.push(lr("Customer:", cust.name));
      out.push(lr("Package:", cust.pkg ?? "N/A"));
      out.push(lr("Amount:", String(pay.amount)));
      if (pay.taxAmount) {
        out.push(lr(`${getTaxLabel(s)}:`, String(pay.taxAmount)));
        out.push(lr("Total:", String(pay.amount + pay.taxAmount)));
      }
      out.push(lr("Status:", pay.status.toUpperCase()));
      out.push(lr("Month:", pay.month));
      out.push(lr("Agent:", pay.agentName));
      out.push(lr("Balance:", String(cust.balance)));
      out.push(hr);

      // Tax QR
      const taxQr = buildTaxQrEscPos({
        settings: s, receiptNo: pay.receiptNo ?? 0,
        taxAmount: pay.taxAmount ?? 0, total: pay.amount + (pay.taxAmount ?? 0), createdAt: pay.createdAt,
      });
      if (taxQr) out.push(taxQr);

      out.push(CENTER_ON);
      out.push("Thank you!");
      out.push(LEFT_ON);
      out.push("");
      out.push("");
      out.push("");
      out.push("\x1dV\x41\x03");

      const escPos = out.join("\n");
      if (isDuplicatePrint(escPos)) return;

      try {
        await sendToDefaultPrinter(s, escPos);
      } catch (err: any) {
        console.error("Recovery receipt print error:", err);
        throw new Error(err?.message || "Printing failed. Check printer connection.");
      }
      return;
    }
    // Web fallback
    const taxHtml = pay.taxAmount
      ? `<p>${getTaxLabel(settings)}: ${pay.taxAmount}</p><p>Total: ${pay.amount + pay.taxAmount}</p>`
      : "";
    const w = window.open("", "_blank", "width=350,height=500");
    if (!w) return;
    w.document.write(`<html><head><title>Receipt</title><style>body{font-family:monospace;font-size:12px;padding:10px}h3{text-align:center;margin:0}h2{text-align:center;margin:0 0 4px}</style></head><body>
      <h2>${businessName}</h2><h3>PAYMENT RECEIPT</h3><hr/>
      <p>Receipt #: ${pay.receiptNo ?? "N/A"}</p>
      <p>Customer: ${cust.name}</p>
      <p>Package: ${cust.pkg ?? "N/A"}</p>
      <p>Amount: ${pay.amount}</p>
      ${taxHtml}
      <p>Status: <b>${pay.status.toUpperCase()}</b></p>
      <p>Month: ${pay.month}</p>
      <p>Agent: ${pay.agentName}</p>
      <p>Date: ${format(pay.createdAt, "dd/MM/yyyy hh:mm a")}</p>
      <hr/></body></html>`);
    w.document.close();
    w.print();
  };

  // ── Share history ──
  const shareHistory = async (cust: RecoveryCustomer) => {
    const custPayments = getCustomerPayments(cust.id);
    // Always generate PDF (both native and web)
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Payment History: ${cust.name}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Package: ${cust.pkg ?? "N/A"}  |  Monthly: ${cust.monthlyBill}  |  Balance: ${cust.balance}`, 14, 23);
    doc.setFontSize(9);
    let y = 32;
    doc.setFont("helvetica", "bold");
    doc.text("Month", 14, y); doc.text("Status", 45, y); doc.text("Amount", 75, y); doc.text("Agent", 105, y); doc.text("Date", 145, y);
    doc.setFont("helvetica", "normal");
    y += 6;
    for (const p of custPayments) {
      if (y > 280) { doc.addPage(); y = 15; }
      doc.text(p.month, 14, y);
      doc.text(p.status.toUpperCase(), 45, y);
      doc.text(String(p.amount), 75, y);
      doc.text(p.agentName, 105, y);
      doc.text(format(p.createdAt, "dd/MM/yyyy"), 145, y);
      y += 6;
    }
    const fileName = `history_${cust.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    await sharePdfBytes(bytes, fileName, `History - ${cust.name}`);
  };

  // ── Overall Report PDF (per-agent breakdown) ──
  const generateReport = async () => {
    const from = new Date(reportFrom); from.setHours(0, 0, 0, 0);
    const to = new Date(reportTo); to.setHours(23, 59, 59, 999);

    const periodPayments = payments.filter(p => p.createdAt >= from.getTime() && p.createdAt <= to.getTime());

    // Build per-agent stats using agentName from payments
    const agentMap = new Map<string, { totalCustomers: number; totalRecovery: number; paidCount: number; paidAmount: number; unpaidCount: number; unpaidAmount: number }>();

    // Group customers by agent
    const agentCustomerMap = new Map<string, Set<string>>();
    for (const c of allCustomers) {
      const aName = c.agentName || "Unassigned";
      if (!agentCustomerMap.has(aName)) agentCustomerMap.set(aName, new Set());
      agentCustomerMap.get(aName)!.add(c.id);
    }

    // Initialize agent entries
    for (const [aName, custSet] of agentCustomerMap) {
      const agentCusts = allCustomers.filter(c => custSet.has(c.id));
      const totalRecovery = agentCusts.reduce((s, c) => s + c.monthlyBill, 0);
      agentMap.set(aName, { totalCustomers: custSet.size, totalRecovery, paidCount: 0, paidAmount: 0, unpaidCount: 0, unpaidAmount: 0 });
    }

    // Tally payments in the date range
    for (const p of periodPayments) {
      const cust = allCustomers.find(c => c.id === p.customerId);
      const aName = cust?.agentName || p.agentName || "Unassigned";
      if (!agentMap.has(aName)) {
        agentMap.set(aName, { totalCustomers: 0, totalRecovery: 0, paidCount: 0, paidAmount: 0, unpaidCount: 0, unpaidAmount: 0 });
      }
      const entry = agentMap.get(aName)!;
      if (p.status === "paid") { entry.paidCount++; entry.paidAmount += p.amount; }
      else { entry.unpaidCount++; entry.unpaidAmount += (cust?.monthlyBill ?? 0); }
    }

    // Grand totals
    const grandTotalCustomers = allCustomers.length;
    const grandTotalRecovery = allCustomers.reduce((s, c) => s + c.monthlyBill, 0);
    const grandPaidAmount = periodPayments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const grandPaidCount = periodPayments.filter(p => p.status === "paid").length;
    const grandUnpaidCount = periodPayments.filter(p => p.status === "unpaid").length;
    const grandUnpaidAmount = grandTotalRecovery - grandPaidAmount;
    const grandBalance = allCustomers.reduce((s, c) => s + c.balance, 0);

    const agentEntries = Array.from(agentMap.entries());
    const pageHeight = Math.max(150, 60 + agentEntries.length * 40);
    const doc = new jsPDF({ unit: "mm", format: [80, pageHeight] });
    let y = 8;
    doc.setFontSize(11); doc.text("OVERALL RECOVERY REPORT", 40, y, { align: "center" }); y += 5;
    doc.setFontSize(8);
    doc.text(`${format(from, "dd/MM/yyyy")} - ${format(to, "dd/MM/yyyy")}`, 40, y, { align: "center" }); y += 6;

    // Grand summary
    doc.setFontSize(9); doc.text("=== Grand Total ===", 4, y); y += 4;
    doc.setFontSize(8);
    doc.text(`Total Customers: ${grandTotalCustomers}`, 4, y); y += 4;
    doc.text(`Total Recovery: ${grandTotalRecovery}`, 4, y); y += 4;
    doc.text(`Paid Customers: ${grandPaidCount}`, 4, y); y += 4;
    doc.text(`Paid Amount: ${grandPaidAmount}`, 4, y); y += 4;
    doc.text(`Unpaid Customers: ${grandUnpaidCount}`, 4, y); y += 4;
    doc.text(`Unpaid Amount: ${grandUnpaidAmount}`, 4, y); y += 4;
    doc.text(`Remaining Balance: ${grandBalance}`, 4, y); y += 6;

    // Per-agent breakdown
    for (const [aName, data] of agentEntries) {
      doc.setFontSize(9); doc.text(`--- ${aName} ---`, 4, y); y += 4;
      doc.setFontSize(8);
      doc.text(`Total Customers: ${data.totalCustomers}`, 6, y); y += 4;
      doc.text(`Total Recovery: ${data.totalRecovery}`, 6, y); y += 4;
      doc.text(`Paid: ${data.paidCount} customers = ${data.paidAmount}`, 6, y); y += 4;
      doc.text(`Unpaid: ${data.unpaidCount} customers = ${data.unpaidAmount}`, 6, y); y += 4;
      y += 2;
    }

    const blob = doc.output("blob");
    await downloadFile(blob, `recovery_report_${format(from, "yyyyMMdd")}_${format(to, "yyyyMMdd")}.pdf`);
  };

  // ── Export paid/unpaid list ──
  const exportListExcel = async (status: "paid" | "unpaid") => {
    const monthPayments = payments.filter(p => p.month === currentMonth && p.status === status);
    const custIds = new Set(monthPayments.map(p => p.customerId));
    const list = customers.filter(c => custIds.has(c.id));
    const rows = list.map(c => ({
      Name: c.name, Contact: c.contact ?? "", Pkg: c.pkg ?? "", "Monthly Bill": c.monthlyBill, Balance: c.balance, Agent: c.agentName ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, status === "paid" ? "Paid" : "Unpaid");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    await downloadFile(new Blob([buf]), `recovery_${status}_${currentMonth}.xlsx`);
  };

  const exportListPdf = async (status: "paid" | "unpaid") => {
    const monthPayments = payments.filter(p => p.month === currentMonth && p.status === status);
    const custIds = new Set(monthPayments.map(p => p.customerId));
    const list = customers.filter(c => custIds.has(c.id));

    const doc = new jsPDF({ unit: "mm", format: [80, Math.max(100, 20 + list.length * 6)] });
    let y = 8;
    doc.setFontSize(10); doc.text(`${status.toUpperCase()} CUSTOMERS - ${currentMonth}`, 40, y, { align: "center" }); y += 6;
    doc.setFontSize(7);
    for (const c of list) {
      doc.text(`${c.name} | ${c.pkg ?? ""} | Bill: ${c.monthlyBill} | Bal: ${c.balance}`, 4, y); y += 5;
    }
    doc.text(`Total: ${list.length}`, 4, y);
    const blob = doc.output("blob");
    await downloadFile(blob, `recovery_${status}_${currentMonth}.pdf`);
  };

  const historyCustomer = historyId ? customers.find(c => c.id === historyId) : null;
  const historyPayments = historyId ? getCustomerPayments(historyId) : [];

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Recovery</h1>
          <p className="text-sm text-muted-foreground">Manage recovery customers, payments & reports.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={startExportAgentSales}>
            <Upload className="h-3 w-3 mr-1" /> Export Sales
          </Button>
          {(isAdmin || isCashier) && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowAgentExport(true)}>
                <SendHorizonal className="h-3 w-3 mr-1" /> Export to Agent
              </Button>
              <input ref={collectFileRef} type="file" accept=".json" multiple onChange={collectAgentData} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => collectFileRef.current?.click()}>
                <Download className="h-3 w-3 mr-1" /> Collect Agent Data
              </Button>
            </>
          )}
          {/* Agent: Import Assignment file from admin */}
          {isRecovery && (
            <>
              <input ref={assignmentFileRef} type="file" accept=".json" onChange={handleAgentAssignmentImport} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => assignmentFileRef.current?.click()}>
                <Download className="h-3 w-3 mr-1" /> Import Assignment
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => void exportExcel()}>
            <Download className="h-3 w-3 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowReport(true)}>
            <FileText className="h-3 w-3 mr-1" /> Report
          </Button>
          {(isAdmin || isCashier) && (
            <Button variant={showAgentView ? "default" : "outline"} size="sm" onClick={() => setShowAgentView(v => !v)}>
              <Users className="h-3 w-3 mr-1" /> Agent View
            </Button>
          )}
          {(isAdmin || isCashier || (isRecovery && agentCanAddCustomer)) && (
            <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
              <Plus className="h-3 w-3 mr-1" /> Add Customer
            </Button>
          )}
        </div>
      </header>

      {/* Agent filter for admin/cashier */}
      {(isAdmin || isCashier) && agents.length > 0 && (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="Filter by agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
              <SelectItem value="__unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{customers.length} customers</span>
        </div>
      )}

      {/* Agent View */}
      {(isAdmin || isCashier) && showAgentView && (
        <RecoveryAgentView customers={allCustomers} payments={payments} agents={agents} onRefresh={load} />
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Collect stats banner */}
      {collectStats && (
        <Card className="bg-muted/50">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">Last Collection:</span>{" "}
              {collectStats.imported} new customers, {collectStats.payments} payments imported, {collectStats.skipped} existing updated
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCollectStats(null)}>
              <X className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick lists */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => void exportListExcel("paid")}>
          <FileSpreadsheet className="h-3 w-3 mr-1" /> Paid Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportListPdf("paid")}>
          <FileText className="h-3 w-3 mr-1" /> Paid PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportListExcel("unpaid")}>
          <FileSpreadsheet className="h-3 w-3 mr-1" /> Unpaid Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportListPdf("unpaid")}>
          <FileText className="h-3 w-3 mr-1" /> Unpaid PDF
        </Button>
      </div>

      {/* Add/Edit Form */}
      {showAdd && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">{editId ? "Edit Customer" : "Add Customer"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="space-y-1">
              <Label>Contact</Label>
              <Input value={formContact} onChange={e => setFormContact(e.target.value)} inputMode="tel" placeholder="Phone" />
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Address" />
            </div>
            <div className="space-y-1">
              <Label>Package</Label>
              <Input value={formPkg} onChange={e => setFormPkg(e.target.value)} placeholder="e.g. Basic Plan" />
            </div>
            <div className="space-y-1">
              <Label>Billing Period</Label>
              <Select value={formFrequency} onValueChange={(v) => setFormFrequency(v as BillingFrequency)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_FREQUENCIES.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Bill Amount</Label>
              <Input type="number" inputMode="numeric" value={formBill || ""} onChange={e => setFormBill(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>Previous Balance</Label>
              <Input type="number" inputMode="numeric" value={formBalance || ""} onChange={e => setFormBalance(Number(e.target.value) || 0)} />
            </div>
            {/* Agent assignment (admin/cashier only) */}
            {(isAdmin || isCashier) && agents.length > 0 && (
              <div className="space-y-1">
                <Label>Assign Agent</Label>
                <Select value={formAgentId} onValueChange={setFormAgentId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No agent</SelectItem>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="sm:col-span-3 flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={() => void saveCustomer()}>{editId ? "Update" : "Add"}</Button>
            </div>

            {/* Bulk Import Section inside Add Customer */}
            {!editId && (
              <div className="sm:col-span-3 border-t pt-3 mt-1">
                <p className="text-sm font-medium mb-2">Or Import from Excel</p>
                <div className="flex items-end gap-3 flex-wrap">
                  {(isAdmin || isCashier) && agents.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Assign Agent (bulk)</Label>
                      <Select value={bulkAgentId} onValueChange={setBulkAgentId}>
                        <SelectTrigger className="h-9 w-48">
                          <SelectValue placeholder="Select agent for import" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">No agent</SelectItem>
                          {agents.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} className="hidden" />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3 w-3 mr-1" /> Import Excel
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Columns: Name, Contact, Address, Pkg, Frequency, Bill, Balance</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History View */}
      {historyCustomer && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-2 px-4 border-b">
            <CardTitle className="text-base">History: {historyCustomer.name}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => void shareHistory(historyCustomer)}>
                <Share2 className="h-3 w-3 mr-1" /> Share
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setHistoryId(null)}><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            <div className="text-xs text-muted-foreground mb-2">Pkg: {historyCustomer.pkg ?? "N/A"} | Bill: {historyCustomer.monthlyBill} | Balance: {historyCustomer.balance} | Agent: {historyCustomer.agentName ?? "N/A"}</div>
            {historyPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">No payment records yet.</p>
            ) : (
              <div className="rounded border overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/50 border-b">
                    <th className="px-2 py-1 text-left">Month</th><th className="px-2 py-1 text-left">Status</th>
                    <th className="px-2 py-1 text-right">Amount</th><th className="px-2 py-1 text-left">Agent</th>
                    <th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-right">Actions</th>
                  </tr></thead>
                  <tbody>
                    {historyPayments.map(p => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-2 py-1">{p.month}</td>
                        <td className="px-2 py-1">
                          <span className={p.status === "paid" ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>{p.status.toUpperCase()}</span>
                        </td>
                        <td className="px-2 py-1 text-right">{p.amount}</td>
                        <td className="px-2 py-1">{p.agentName}</td>
                        <td className="px-2 py-1">{format(p.createdAt, "dd/MM/yy")}</td>
                        <td className="px-2 py-1 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => printReceipt(historyCustomer, p)}>
                              <Printer className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void shareReceipt(historyCustomer, p)}>
                              <Share2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customer list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No customers found.</p>
      ) : (
        <div className="grid gap-2">
          {filtered.map(c => {
            const monthStatus = getCurrentMonthStatus(c.id);
            return (
              <Card key={c.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.pkg && <span className="mr-2">📦 {c.pkg}</span>}
                      {c.contact && <span className="mr-2">📞 {c.contact}</span>}
                      {c.address && <span className="mr-2">📍 {c.address}</span>}
                      {c.agentName && <span>👤 {c.agentName}</span>}
                    </div>
                    <div className="text-xs mt-1">
                      Bill: <span className="font-semibold">{c.monthlyBill}</span><span className="text-muted-foreground">/{(c.billingFrequency ?? "monthly").slice(0, 1)}</span>
                      {" | "}Balance: <span className={c.balance > 0 ? "text-red-500 font-semibold" : "text-green-600 font-semibold"}>{c.balance}</span>
                      {monthStatus && (
                        <span className={`ml-2 ${monthStatus.status === "paid" ? "text-green-600" : "text-red-500"}`}>
                          [{currentMonth}: {monthStatus.status.toUpperCase()}]
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {!monthStatus && (
                      <>
                        {settings?.taxEnabled && (
                          <div className="flex items-center gap-1 mr-1">
                            <Switch checked={!!taxEnabledMap[c.id]} onCheckedChange={() => toggleTax(c.id)} className="scale-[0.6]" />
                            <span className="text-[10px] text-muted-foreground">{getTaxLabel(settings)}</span>
                          </div>
                        )}
                        <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => void markPaid(c)}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Paid
                        </Button>
                        <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => void markUnpaid(c)}>
                          <XCircle className="h-3 w-3 mr-1" /> Unpaid
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setHistoryId(c.id)}>
                      <History className="h-3 w-3 mr-1" /> History
                    </Button>
                    {(isAdmin || isCashier || (isRecovery && agentCanAddCustomer)) && (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => editCustomer(c)}>Edit</Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(c.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Backup & Restore */}
      {(isAdmin || isCashier) && <RecoveryBackup onRestore={load} />}

      {/* Report Dialog */}
      <AlertDialog open={showReport} onOpenChange={setShowReport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recovery Report</AlertDialogTitle>
            <AlertDialogDescription>Generate overall report with per-agent breakdown.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 sm:grid-cols-2 my-2">
            <div className="space-y-1"><Label>From</Label><Input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label>To</Label><Input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} /></div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void generateReport()}>Generate PDF</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the customer and all their payment history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && void deleteCustomer(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <FileNamePrompt
        open={exportPromptOpen}
        defaultName={exportDefaultName}
        onConfirm={confirmExport}
        onCancel={() => setExportPromptOpen(false)}
      />
      <RecoveryAgentExport
        open={showAgentExport}
        onClose={() => setShowAgentExport(false)}
        customers={allCustomers}
        agents={agents}
      />
    </div>
  );
}
