import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/appDb";
import type { RecoveryCustomer, RecoveryPayment, StaffAccount } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import {
  Plus, Search, Upload, Download, FileSpreadsheet, Trash2, CheckCircle, XCircle,
  History, Printer, Share2, X, FileText, Users,
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
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import jsPDF from "jspdf";

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
  if (Capacitor.isNativePlatform()) {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const path = `Sangi Pos/Recovery/${fileName}`;
      await Filesystem.writeFile({ path, data: base64, directory: Directory.Documents, recursive: true });
      try { await Share.share({ title: fileName, url: (await Filesystem.getUri({ path, directory: Directory.Documents })).uri }); } catch { /* cancelled */ }
    };
    reader.readAsDataURL(blob);
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }
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
  const [search, setSearch] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);

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
  const [formAgentId, setFormAgentId] = React.useState<string>("");

  // History view
  const [historyId, setHistoryId] = React.useState<string | null>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  // Report
  const [showReport, setShowReport] = React.useState(false);
  const [reportFrom, setReportFrom] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [reportTo, setReportTo] = React.useState(format(new Date(), "yyyy-MM-dd"));

  // Current month
  const currentMonth = format(new Date(), "yyyy-MM");

  const load = React.useCallback(async () => {
    const c = await db.recoveryCustomers.toArray();
    const p = await db.recoveryPayments.toArray();
    const staff = await db.staffAccounts.where("role").equals("recovery").toArray();
    setAllCustomers(c);
    setPayments(p);
    setAgents(staff);
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
    setFormAgentId(""); setEditId(null); setShowAdd(false);
  };

  const saveCustomer = async () => {
    if (!formName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const assignedAgent = agents.find(a => a.id === formAgentId);
    if (editId) {
      await db.recoveryCustomers.update(editId, {
        name: formName.trim(), contact: formContact.trim() || undefined, address: formAddress.trim() || undefined,
        pkg: formPkg.trim() || undefined, monthlyBill: formBill, balance: formBalance,
        agentId: formAgentId || undefined, agentName: assignedAgent?.name || undefined,
      });
    } else {
      // For recovery agents adding customers, auto-assign to themselves
      const effectiveAgentId = isRecovery && myAgentId ? myAgentId : formAgentId;
      const effectiveAgentName = isRecovery ? agentName : assignedAgent?.name;
      await db.recoveryCustomers.add({
        id: uid("rcust"), name: formName.trim(), contact: formContact.trim() || undefined, address: formAddress.trim() || undefined,
        pkg: formPkg.trim() || undefined, monthlyBill: formBill, balance: formBalance,
        agentId: effectiveAgentId || undefined, agentName: effectiveAgentName || undefined,
        createdAt: Date.now(),
      });
    }
    toast({ title: editId ? "Customer updated" : "Customer added" });
    resetForm();
    void load();
  };

  const editCustomer = (c: RecoveryCustomer) => {
    setEditId(c.id); setFormName(c.name); setFormContact(c.contact ?? ""); setFormAddress(c.address ?? "");
    setFormPkg(c.pkg ?? ""); setFormBill(c.monthlyBill); setFormBalance(c.balance);
    setFormAgentId(c.agentId ?? ""); setShowAdd(true);
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
    const payment: RecoveryPayment = {
      id: uid("rpay"), customerId: cust.id, receiptNo, amount: cust.monthlyBill,
      status: "paid", agentName, month: currentMonth, createdAt: Date.now(),
    };
    await db.recoveryPayments.add(payment);
    const newBalance = Math.max(0, cust.balance - cust.monthlyBill);
    await db.recoveryCustomers.update(cust.id, { balance: newBalance });
    toast({ title: `${cust.name} marked PAID` });
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
      const importAgentId = isRecovery && myAgentId ? myAgentId : (selectedAgent !== "all" ? selectedAgent : undefined);
      const importAgentName = isRecovery ? agentName : (importAgentId ? agents.find(a => a.id === importAgentId)?.name : undefined);
      for (const r of rows) {
        const name = String(r["Name"] || r["name"] || "").trim();
        if (!name) continue;
        await db.recoveryCustomers.add({
          id: uid("rcust"), name,
          contact: String(r["Contact"] || r["contact"] || r["Phone"] || r["phone"] || "").trim() || undefined,
          address: String(r["Address"] || r["address"] || "").trim() || undefined,
          pkg: String(r["Pkg"] || r["pkg"] || r["Package"] || r["package"] || "").trim() || undefined,
          monthlyBill: Number(r["Monthly Bill"] || r["monthlyBill"] || r["monthly_bill"] || 0),
          balance: Number(r["Balance"] || r["balance"] || 0),
          agentId: importAgentId || undefined,
          agentName: importAgentName || undefined,
          createdAt: Date.now(),
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
        "Monthly Bill": c.monthlyBill, Balance: c.balance,
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

  // ── Share/Print receipt ──
  const shareReceipt = async (cust: RecoveryCustomer, pay: RecoveryPayment) => {
    const text = [
      `--- PAYMENT RECEIPT ---`,
      `Receipt #: ${pay.receiptNo ?? "N/A"}`,
      `Customer: ${cust.name}`,
      `Package: ${cust.pkg ?? "N/A"}`,
      `Amount: ${pay.amount}`,
      `Status: ${pay.status.toUpperCase()}`,
      `Month: ${pay.month}`,
      `Agent: ${pay.agentName}`,
      `Date: ${format(pay.createdAt, "dd/MM/yyyy hh:mm a")}`,
      `------------------------`,
    ].join("\n");
    if (Capacitor.isNativePlatform()) {
      try { await Share.share({ title: "Payment Receipt", text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard?.writeText(text);
      toast({ title: "Receipt copied to clipboard" });
    }
  };

  const printReceipt = (cust: RecoveryCustomer, pay: RecoveryPayment) => {
    const w = window.open("", "_blank", "width=350,height=500");
    if (!w) return;
    w.document.write(`<html><head><title>Receipt</title><style>body{font-family:monospace;font-size:12px;padding:10px}h3{text-align:center;margin:0}</style></head><body>
      <h3>PAYMENT RECEIPT</h3><hr/>
      <p>Receipt #: ${pay.receiptNo ?? "N/A"}</p>
      <p>Customer: ${cust.name}</p>
      <p>Package: ${cust.pkg ?? "N/A"}</p>
      <p>Amount: ${pay.amount}</p>
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
    const lines = [`Payment History: ${cust.name}`, `Pkg: ${cust.pkg ?? "N/A"}`, `Monthly: ${cust.monthlyBill}`, `Balance: ${cust.balance}`, `---`];
    for (const p of custPayments) {
      lines.push(`${p.month} | ${p.status.toUpperCase()} | ${p.amount} | ${p.agentName} | ${format(p.createdAt, "dd/MM/yyyy")}`);
    }
    const text = lines.join("\n");
    if (Capacitor.isNativePlatform()) {
      try { await Share.share({ title: `History - ${cust.name}`, text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard?.writeText(text);
      toast({ title: "History copied" });
    }
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
          {(isAdmin || isCashier) && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3 w-3 mr-1" /> Import
              </Button>
            </>
          )}
          {isRecovery && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3 w-3 mr-1" /> Import
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => void exportExcel()}>
            <Download className="h-3 w-3 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowReport(true)}>
            <FileText className="h-3 w-3 mr-1" /> Report
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
            <Plus className="h-3 w-3 mr-1" /> Add Customer
          </Button>
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

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
              <Input value={formPkg} onChange={e => setFormPkg(e.target.value)} placeholder="e.g. 10 Mbps" />
            </div>
            <div className="space-y-1">
              <Label>Monthly Bill</Label>
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
                    <SelectItem value="">No agent</SelectItem>
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
                      Bill: <span className="font-semibold">{c.monthlyBill}</span>
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
                    {(isAdmin || isCashier) && (
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
    </div>
  );
}
