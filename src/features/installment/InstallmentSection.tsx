import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/appDb";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import type { Settings, StaffAccount } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";
import { formatIntMoney, parseNonDecimalInt, fmtDate, fmtDateTime } from "@/features/pos/format";
import { useAuth } from "@/auth/AuthProvider";
import { Search, Plus, Edit, Trash2, CreditCard, History, UserCheck, UserX, Download, Upload, FileSpreadsheet, Share2, ImageIcon, CheckCircle, Ban, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InstallmentCustomerForm } from "./InstallmentCustomerForm";
import { InstallmentPaymentDialog } from "./InstallmentPaymentDialog";
import { InstallmentPaymentHistory } from "./InstallmentPaymentHistory";
import { InstallmentReports } from "./InstallmentReports";
import { InstallmentAgentAssign } from "./InstallmentAgentAssign";
import { exportInstallmentExcel, importInstallmentExcel, downloadSampleExcel, exportAgentData, importAgentData, importAgentAssignment, exportStatusListExcel, exportDefaulterListToAgent, importDefaulterAssignment } from "./installment-excel";
import { InstallmentAgentExport } from "./InstallmentAgentExport";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { buildInstallmentReceiptPdf, buildPaymentHistoryPdf } from "./installment-pdf";
import { sharePdfBytes, savePdfBytes, saveFileBlob, shareFileBlob } from "@/features/pos/share-utils";
import { canMakeSale, incrementSaleCount } from "@/features/licensing/licensing-db";
import { InstallmentImageViewer } from "./InstallmentImageViewer";

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentWeek(): string {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getCurrentYear(): string {
  return `${new Date().getFullYear()}`;
}

function getCurrentPeriod(frequency?: string): string {
  if (frequency === "weekly") return getCurrentWeek();
  if (frequency === "yearly") return getCurrentYear();
  return getCurrentMonth();
}

function isPaymentOverdue(customer: InstallmentCustomer): boolean {
  if (!customer.dueDate || customer.totalBalance <= 0) return false;
  const now = new Date();
  const day = now.getDate();
  return day > customer.dueDate;
}

export function InstallmentSection() {
  const { toast } = useToast();
  const { session } = useAuth();
  const [customers, setCustomers] = React.useState<InstallmentCustomer[]>([]);
  const [payments, setPayments] = React.useState<InstallmentPayment[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [agents, setAgents] = React.useState<StaffAccount[]>([]);
  const [query, setQuery] = React.useState("");
  const [statusTab, setStatusTab] = React.useState<"active" | "cleared" | "defaulter">("active");
  const [filterTab, setFilterTab] = React.useState<"all" | "paid" | "unpaid">("all");

  // Dialogs
  const [formOpen, setFormOpen] = React.useState(false);
  const [editCustomer, setEditCustomer] = React.useState<InstallmentCustomer | undefined>();
  const [paymentCustomerId, setPaymentCustomerId] = React.useState<string | null>(null);
  const [historyCustomerId, setHistoryCustomerId] = React.useState<string | null>(null);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [imageViewer, setImageViewer] = React.useState<{ images: string[]; index: number; name: string } | null>(null);
  const [agentExportOpen, setAgentExportOpen] = React.useState(false);
  const [clearConfirmId, setClearConfirmId] = React.useState<string | null>(null);

  const isAdmin = session?.role === "admin";
  const isCashier = session?.role === "cashier";
  const isAgent = session?.role === "installment_agent" as any;
  const canEdit = isAdmin || isCashier;

  const refresh = React.useCallback(async () => {
    let custs = await db.installmentCustomers.orderBy("createdAt").toArray();
    if (isAgent && session) {
      const staffList = await db.staffAccounts.where("name").equals(session.username).toArray();
      const staffId = staffList[0]?.id;
      if (staffId) custs = custs.filter(c => c.agentId === staffId);
    }
    setCustomers(custs);
    const pays = await db.installmentPayments.orderBy("createdAt").toArray();
    setPayments(pays);
    const s = await db.settings.get("app");
    setSettings(s ?? null);
    const staff = await db.staffAccounts.where("role").equals("installment_agent").toArray();
    setAgents(staff);
  }, [isAgent, session]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const isCurrentPeriodPaid = React.useCallback((customer: InstallmentCustomer) => {
    const period = getCurrentPeriod(customer.frequency);
    return payments.some(p => p.customerId === customer.id && p.month === period);
  }, [payments]);

  // Filter by status tab, then by paid/unpaid
  const filtered = React.useMemo(() => {
    let list = customers;
    // Status filter — defaulters show in BOTH active and defaulter tabs
    if (statusTab === "active") {
      list = list.filter(c => {
        const s = c.status || "active";
        return s === "active" || s === "defaulter"; // defaulters stay in active list
      });
    } else {
      list = list.filter(c => {
        const s = c.status || "active";
        return s === statusTab;
      });
    }
    // Search
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q) ||
        (c.agentName ?? "").toLowerCase().includes(q)
      );
    }
    // Filter by paid/unpaid (only for active tab)
    if (statusTab === "active") {
      if (filterTab === "paid") {
        list = list.filter(c => isCurrentPeriodPaid(c) || c.totalBalance <= 0);
      } else if (filterTab === "unpaid") {
        list = list.filter(c => !isCurrentPeriodPaid(c) && c.totalBalance > 0);
      }
    }
    return list;
  }, [customers, query, statusTab, filterTab, isCurrentPeriodPaid]);

  const openNew = () => { setEditCustomer(undefined); setFormOpen(true); };
  const openEdit = (c: InstallmentCustomer) => { setEditCustomer(c); setFormOpen(true); };

  const saveCustomer = async (c: InstallmentCustomer) => {
    const isNew = !customers.some(x => x.id === c.id);
    if (isNew) {
      const check = await canMakeSale("installment");
      if (!check.allowed) {
        toast({ title: "Free limit reached", description: check.message, variant: "destructive" });
        return;
      }
    }
    // Ensure new customers have active status
    if (isNew && !c.status) c.status = "active";
    await db.installmentCustomers.put(c);
    if (isNew) await incrementSaleCount("installment");
    setFormOpen(false);
    setEditCustomer(undefined);
    toast({ title: "Customer saved" });
    await refresh();
  };

  const deleteCustomer = async (c: InstallmentCustomer) => {
    if (!confirm(`Delete "${c.name}" and all payment records? This cannot be undone.`)) return;
    await db.transaction("rw", [db.installmentCustomers, db.installmentPayments], async () => {
      await db.installmentPayments.where("customerId").equals(c.id).delete();
      await db.installmentCustomers.delete(c.id);
    });
    toast({ title: "Deleted" });
    await refresh();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Clear customer (admin)
  const clearCustomer = async (c: InstallmentCustomer) => {
    const updated = { ...c, status: "cleared" as const, totalBalance: 0, clearedAt: Date.now() };
    await db.installmentCustomers.put(updated);
    toast({ title: `${c.name} marked as Cleared ✅` });
    setClearConfirmId(null);
    await refresh();
  };

  // Bulk mark as defaulter
  const bulkMarkDefaulter = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Mark ${selectedIds.size} customer(s) as Defaulter?`)) return;
    for (const id of selectedIds) {
      const c = customers.find(x => x.id === id);
      if (c) {
        await db.installmentCustomers.put({ ...c, status: "defaulter" });
      }
    }
    setSelectedIds(new Set());
    toast({ title: `${selectedIds.size} customers marked as Defaulter` });
    await refresh();
  };

  // Restore customer to active
  const restoreCustomer = async (c: InstallmentCustomer) => {
    await db.installmentCustomers.put({ ...c, status: "active", clearedAt: undefined });
    toast({ title: `${c.name} restored to Active` });
    await refresh();
  };

  const handleExport = async () => {
    try {
      const blob = exportInstallmentExcel(customers, payments);
      const fileName = `installment_data_${Date.now()}.xlsx`;
      await saveFileBlob(blob, fileName);
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleStatusExport = async (status: "cleared" | "defaulter", mode: "save" | "share") => {
    try {
      const statusCustomers = customers.filter(c => c.status === status);
      if (statusCustomers.length === 0) { toast({ title: `No ${status} customers to export` }); return; }
      const blob = exportStatusListExcel(statusCustomers, payments, status);
      const fileName = `${status}_customers_${Date.now()}.xlsx`;
      if (mode === "save") await saveFileBlob(blob, fileName);
      else await shareFileBlob(blob, fileName);
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleImport = async (file: File) => {
    try {
      const imported = await importInstallmentExcel(file);
      for (const c of imported) await db.installmentCustomers.put(c);
      toast({ title: `Imported ${imported.length} customers` });
      await refresh();
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleSampleDownload = async () => {
    try {
      const blob = downloadSampleExcel();
      await saveFileBlob(blob, "installment_sample_import.xlsx");
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  // Defaulter export to agent
  const handleDefaulterExportToAgent = async (agent: StaffAccount) => {
    try {
      const blob = exportDefaulterListToAgent(customers, payments, {
        id: agent.id, name: agent.name, pin: agent.pin, phone: agent.phone, role: agent.role,
      });
      const fileName = `defaulters_${agent.name.replace(/\s+/g, "_")}_${Date.now()}.json`;
      await saveFileBlob(blob, fileName);
      const count = customers.filter(c => c.agentId === agent.id && c.status === "defaulter").length;
      toast({ title: `Exported ${count} defaulters for ${agent.name}` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  };

  // Agent: import defaulter assignment
  const handleDefaulterAssignmentImport = async (file: File) => {
    try {
      const result = await importDefaulterAssignment(file);
      let custCount = 0, payCount = 0;

      if (result.agentAccount) {
        const acc = result.agentAccount;
        const deterministicId = `agent_${acc.name.toLowerCase().replace(/\s+/g, "_")}_${acc.pin}`;
        const existing = await db.staffAccounts.get(deterministicId);
        if (!existing) {
          await db.staffAccounts.put({
            id: deterministicId, name: acc.name, phone: acc.phone || undefined,
            role: (acc.role as any) || "installment_agent", pin: acc.pin, createdAt: Date.now(),
          });
        }
        for (const c of result.customers) {
          if (c.agentId === result.agentId) (c as any).agentId = deterministicId;
        }
      }

      for (const c of result.customers) {
        const existing = await db.installmentCustomers.get(c.id);
        if (!existing) {
          await db.installmentCustomers.put({ ...c, images: [] } as any);
          custCount++;
        } else {
          await db.installmentCustomers.put({ ...c, images: existing.images ?? [] } as any);
        }
      }
      for (const p of result.payments) {
        const existing = await db.installmentPayments.get(p.id);
        if (!existing) { await db.installmentPayments.put(p); payCount++; }
      }
      toast({ title: `Imported ${custCount} defaulter customers, ${payCount} payments` });
      await refresh();
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleAgentExport = async () => {
    try {
      const agentPayments = payments.filter(p =>
        customers.some(c => c.id === p.customerId)
      );
      const blob = exportAgentData(agentPayments, session?.username ?? "agent");
      const fileName = `agent_recovery_${session?.username}_${Date.now()}.json`;
      await saveFileBlob(blob, fileName);
      toast({ title: "Agent data exported" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleAgentImport = async (file: File) => {
    try {
      const result = await importAgentData(file);
      let updated = 0;
      for (const payment of result.payments) {
        const existing = await db.installmentPayments.get(payment.id);
        if (!existing) {
          await db.installmentPayments.put(payment);
          const cust = await db.installmentCustomers.get(payment.customerId);
          if (cust) {
            cust.totalBalance = Math.max(0, cust.totalBalance - payment.amount);
            await db.installmentCustomers.put(cust);
          }
          updated++;
        }
      }
      toast({ title: `Imported ${updated} agent payments` });
      await refresh();
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleAgentAssignmentImport = async (file: File) => {
    try {
      const result = await importAgentAssignment(file);
      let custCount = 0, payCount = 0;

      if (result.agentAccount) {
        const acc = result.agentAccount;
        const deterministicId = `agent_${acc.name.toLowerCase().replace(/\s+/g, "_")}_${acc.pin}`;
        const existing = await db.staffAccounts.get(deterministicId);
        if (!existing) {
          await db.staffAccounts.put({
            id: deterministicId,
            name: acc.name,
            phone: acc.phone || undefined,
            role: (acc.role as any) || "installment_agent",
            pin: acc.pin,
            createdAt: Date.now(),
          });
          toast({ title: `Agent account "${acc.name}" created. Login with PIN: ${acc.pin}` });
        }
        for (const c of result.customers) {
          if (c.agentId === result.agentId) {
            (c as any).agentId = deterministicId;
          }
        }
      }

      for (const c of result.customers) {
        const existing = await db.installmentCustomers.get(c.id);
        if (!existing) {
          await db.installmentCustomers.put({ ...c, images: [] } as any);
          custCount++;
        } else {
          await db.installmentCustomers.put({ ...c, images: existing.images ?? [] } as any);
        }
      }
      for (const p of result.payments) {
        const existing = await db.installmentPayments.get(p.id);
        if (!existing) {
          await db.installmentPayments.put(p);
          payCount++;
        }
      }
      toast({ title: `Imported ${custCount} new customers, ${payCount} payments` });
      await refresh();
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    }
  };

  // Status counts
  const activeCount = customers.filter(c => (c.status || "active") === "active").length;
  const clearedCount = customers.filter(c => c.status === "cleared").length;
  const defaulterCount = customers.filter(c => c.status === "defaulter").length;

  return (
    <Tabs defaultValue="customers">
      <TabsList className="flex w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="customers">Customers</TabsTrigger>
        {isAgent && <TabsTrigger value="myreports">My Reports</TabsTrigger>}
        {canEdit && <TabsTrigger value="reports">Reports</TabsTrigger>}
        {isAdmin && <TabsTrigger value="agents">Agents</TabsTrigger>}
      </TabsList>

      <TabsContent value="customers">
        <Card>
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">Installment Customers</CardTitle>
                <CardDescription className="text-xs">Manage installment plans and payments.</CardDescription>
              </div>
              {canEdit && <Button onClick={openNew} size="sm" className="shrink-0"><Plus className="h-4 w-4 mr-1" /> New</Button>}
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExport}><Download className="h-3 w-3 mr-1" /> Export</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                  <label className="cursor-pointer">
                    <Upload className="h-3 w-3 mr-1" /> Import
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleImport(f); e.target.value = ""; }} />
                  </label>
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSampleDownload}><FileSpreadsheet className="h-3 w-3 mr-1" /> Sample</Button>
                {isAdmin && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <label className="cursor-pointer">
                      <Upload className="h-3 w-3 mr-1" /> Agent Data
                      <input type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleAgentImport(f); e.target.value = ""; }} />
                    </label>
                  </Button>
                )}
              </div>
            )}
            {isAgent && (
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                  <label className="cursor-pointer">
                    <Upload className="h-3 w-3 mr-1" /> Import Assignment
                    <input type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleAgentAssignmentImport(f); e.target.value = ""; }} />
                  </label>
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAgentExport}><Download className="h-3 w-3 mr-1" /> Export My Data</Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Status tabs */}
            <div className="flex gap-1 flex-wrap">
              <Button variant={statusTab === "active" ? "default" : "outline"} size="sm" onClick={() => { setStatusTab("active"); setSelectedIds(new Set()); }}>
                Active ({activeCount})
              </Button>
              <Button variant={statusTab === "cleared" ? "default" : "outline"} size="sm" onClick={() => { setStatusTab("cleared"); setSelectedIds(new Set()); }}>
                <CheckCircle className="h-3 w-3 mr-1" /> Cleared ({clearedCount})
              </Button>
              <Button variant={statusTab === "defaulter" ? "default" : "outline"} size="sm" onClick={() => { setStatusTab("defaulter"); setSelectedIds(new Set()); }}>
                <AlertTriangle className="h-3 w-3 mr-1" /> Defaulter ({defaulterCount})
              </Button>
            </div>

            {/* Search */}
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, phone, product, agent..." className="pl-9" />
                </div>
              </div>
              {statusTab === "active" && (
                <div className="flex gap-1">
                  {(["all", "paid", "unpaid"] as const).map(t => (
                    <Button key={t} variant={filterTab === t ? "default" : "outline"} size="sm" onClick={() => setFilterTab(t)} className="capitalize">
                      {t === "all" ? "All" : t === "paid" ? <><UserCheck className="h-3 w-3 mr-1" /> Paid</> : <><UserX className="h-3 w-3 mr-1" /> Unpaid</>}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Select all + bulk actions */}
            {isAdmin && filtered.length > 0 && (
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={e => {
                    if (e.target.checked) setSelectedIds(new Set(filtered.map(c => c.id)));
                    else setSelectedIds(new Set());
                  }}
                  className="rounded"
                />
                <span>Select all ({selectedIds.size} selected)</span>
                {selectedIds.size > 0 && statusTab === "active" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>Assign to Agent</Button>
                    <Button size="sm" variant="destructive" onClick={bulkMarkDefaulter}>
                      <Ban className="h-3 w-3 mr-1" /> Mark Defaulter
                    </Button>
                  </>
                )}
                {statusTab === "active" && (
                  <Button size="sm" variant="outline" onClick={() => setAgentExportOpen(true)}>
                    <Share2 className="h-3 w-3 mr-1" /> Export to Agent
                  </Button>
                )}
              </div>
            )}

            {/* Customer list */}
            {filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                {query ? "No customers match your search." : statusTab === "cleared" ? "No cleared customers." : statusTab === "defaulter" ? "No defaulters." : "No installment customers yet. Add one to get started."}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(c => {
                  const paid = isCurrentPeriodPaid(c);
                  const overdue = !paid && isPaymentOverdue(c);
                  const lateDays = overdue && c.dueDate ? Math.max(0, new Date().getDate() - c.dueDate) : 0;
                  const currentLateFee = lateDays > 0 && c.lateFeePerDay ? lateDays * c.lateFeePerDay : 0;
                  const completed = c.totalBalance <= 0;
                  const customerStatus = c.status || "active";

                  return (
                    <div key={c.id} className={`rounded-md border p-3 space-y-2 ${customerStatus === "defaulter" ? "border-destructive/40 bg-destructive/5" : customerStatus === "cleared" ? "border-green-500/40 bg-green-500/5" : ""}`}>
                      {/* Name + status row */}
                      <div className="flex items-start gap-2">
                        {isAdmin && (
                          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="mt-1 rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{c.name}</span>
                            {customerStatus === "cleared" && <Badge variant="outline" className="text-xs px-1.5 py-0 border-green-600 text-green-600">Cleared ✅</Badge>}
                            {customerStatus === "defaulter" && <Badge variant="destructive" className="text-xs px-1.5 py-0">Defaulter</Badge>}
                            {customerStatus === "active" && completed && <Badge variant="outline" className="text-xs px-1.5 py-0 border-green-600 text-green-600">Done</Badge>}
                            {customerStatus === "active" && !completed && paid && <Badge variant="outline" className="text-xs px-1.5 py-0 border-green-600 text-green-600">Paid</Badge>}
                            {customerStatus === "active" && overdue && <Badge variant="destructive" className="text-xs px-1.5 py-0">Late {lateDays}d</Badge>}
                            {customerStatus === "active" && !completed && !paid && !overdue && <Badge variant="outline" className="text-xs px-1.5 py-0">Pending</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{c.phone}{c.agentName ? ` • ${c.agentName}` : ""}</div>
                        </div>
                      </div>

                      {/* Product & installment info */}
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <div className="rounded bg-muted/50 p-1.5">
                          <div className="text-muted-foreground text-[10px]">Product</div>
                          <div className="font-medium truncate">{c.productName}</div>
                        </div>
                        <div className="rounded bg-muted/50 p-1.5">
                          <div className="text-muted-foreground text-[10px]">Total</div>
                          <div className="font-semibold">{formatIntMoney(c.totalPrice)}</div>
                        </div>
                        <div className="rounded bg-muted/50 p-1.5">
                          <div className="text-muted-foreground text-[10px]">{c.frequency === "weekly" ? "Weekly" : c.frequency === "yearly" ? "Yearly" : "Monthly"}</div>
                          <div className="font-semibold">{formatIntMoney(c.monthlyInstallment)}</div>
                        </div>
                        <div className="rounded bg-muted/50 p-1.5">
                          <div className="text-muted-foreground text-[10px]">Balance</div>
                          <div className={`font-semibold ${c.totalBalance > 0 ? "text-destructive" : "text-green-600"}`}>
                            {formatIntMoney(c.totalBalance)}
                          </div>
                        </div>
                      </div>

                      {currentLateFee > 0 && customerStatus === "active" && (
                        <div className="text-xs text-destructive font-medium">
                          ⚠ {formatIntMoney(currentLateFee)} late ({lateDays}d × {formatIntMoney(c.lateFeePerDay ?? 0)})
                        </div>
                      )}

                      {/* Images thumbnails */}
                      {!isAgent && c.images && c.images.length > 0 && (
                        <div className="flex gap-1.5 overflow-x-auto">
                          {c.images.slice(0, 4).map((img, i) => (
                            <button
                              key={i}
                              type="button"
                              className="shrink-0 rounded border overflow-hidden hover:ring-2 ring-primary transition-all"
                              onClick={() => setImageViewer({ images: c.images!, index: i, name: c.name })}
                            >
                              <img src={img} alt={`doc-${i}`} className="h-12 w-12 object-cover" />
                            </button>
                          ))}
                          {c.images.length > 4 && (
                            <button
                              type="button"
                              className="shrink-0 h-12 w-12 rounded border flex items-center justify-center text-xs text-muted-foreground hover:bg-muted"
                              onClick={() => setImageViewer({ images: c.images!, index: 4, name: c.name })}
                            >
                              +{c.images.length - 4}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-1 flex-wrap pt-1 border-t">
                        {customerStatus === "active" && !completed && (
                          <Button size="sm" className="h-7 text-xs" onClick={() => setPaymentCustomerId(c.id)}>
                            <CreditCard className="h-3 w-3 mr-1" /> Pay
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setHistoryCustomerId(c.id)}>
                          <History className="h-3 w-3 mr-1" /> History
                        </Button>
                        {!isAgent && c.images && c.images.length > 0 && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setImageViewer({ images: c.images!, index: 0, name: c.name })}>
                            <ImageIcon className="h-3 w-3 mr-1" /> {c.images.length}
                          </Button>
                        )}
                        {/* Admin: Clear customer */}
                        {isAdmin && customerStatus === "active" && c.totalBalance > 0 && (
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-600" onClick={() => setClearConfirmId(c.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Clear
                          </Button>
                        )}
                        {/* Admin: Restore from cleared/defaulter */}
                        {isAdmin && (customerStatus === "cleared" || customerStatus === "defaulter") && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void restoreCustomer(c)}>
                            Restore Active
                          </Button>
                        )}
                        {canEdit && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(c)}><Edit className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void deleteCustomer(c)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Form Dialog */}
        <InstallmentCustomerForm
          open={formOpen}
          customer={editCustomer}
          onClose={() => { setFormOpen(false); setEditCustomer(undefined); }}
          onSave={saveCustomer}
        />

        {/* Payment Dialog */}
        {paymentCustomerId && (
          <InstallmentPaymentDialog
            customer={customers.find(c => c.id === paymentCustomerId)!}
            payments={payments.filter(p => p.customerId === paymentCustomerId)}
            settings={settings}
            agentName={session?.username ?? "admin"}
            isAdmin={isAdmin}
            onClose={() => setPaymentCustomerId(null)}
            onSaved={refresh}
          />
        )}

        {/* Payment History Dialog */}
        {historyCustomerId && (
          <InstallmentPaymentHistory
            customer={customers.find(c => c.id === historyCustomerId)!}
            payments={payments.filter(p => p.customerId === historyCustomerId)}
            settings={settings}
            onClose={() => setHistoryCustomerId(null)}
          />
        )}

        {/* Agent Assignment */}
        {assignOpen && (
          <InstallmentAgentAssign
            selectedIds={selectedIds}
            agents={agents}
            onClose={() => setAssignOpen(false)}
            onAssigned={async () => { setAssignOpen(false); setSelectedIds(new Set()); await refresh(); }}
          />
        )}

        {/* Agent Export */}
        <InstallmentAgentExport
          open={agentExportOpen}
          onClose={() => setAgentExportOpen(false)}
          customers={customers}
          agents={agents}
        />

        {/* Image Viewer */}
        {imageViewer && (
          <InstallmentImageViewer
            images={imageViewer.images}
            initialIndex={imageViewer.index}
            customerName={imageViewer.name}
            onClose={() => setImageViewer(null)}
          />
        )}

        {/* Clear Confirm Dialog */}
        {clearConfirmId && (() => {
          const c = customers.find(x => x.id === clearConfirmId);
          if (!c) return null;
          return (
            <Dialog open onOpenChange={() => setClearConfirmId(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Clear Account — {c.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  <p>Mark this customer as <strong>Cleared</strong>? Remaining balance of <strong>{formatIntMoney(c.totalBalance)}</strong> will be set to 0.</p>
                  <p className="text-muted-foreground text-xs">You can also record a payment for the full remaining amount instead.</p>
                </div>
                <DialogFooter className="flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setClearConfirmId(null)}>Cancel</Button>
                  <Button variant="outline" onClick={() => { setClearConfirmId(null); setPaymentCustomerId(c.id); }}>
                    <CreditCard className="h-4 w-4 mr-1" /> Pay Full Amount
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => void clearCustomer(c)}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Mark Cleared
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        })()}
      </TabsContent>

      {isAgent && (
        <TabsContent value="myreports">
          <InstallmentReports
            customers={customers}
            payments={payments.filter(p => customers.some(c => c.id === p.customerId))}
            agents={[]}
            settings={settings}
            agentMode
            agentName={session?.username ?? "Agent"}
          />
        </TabsContent>
      )}

      {canEdit && (
        <TabsContent value="reports">
          <InstallmentReports customers={customers} payments={payments} agents={agents} settings={settings} />
        </TabsContent>
      )}

      {isAdmin && (
        <TabsContent value="agents">
          <Card>
            <CardHeader>
              <CardTitle>Installment Agents</CardTitle>
              <CardDescription>
                Create installment agent logins in Admin → Settings → Staff Accounts (role: Installment Agent).
                Then assign customers to agents using the checkbox selection on the Customers tab.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No installment agents created yet. Go to Admin → Settings → Staff Accounts to add one.</p>
              ) : (
                <div className="space-y-2">
                  {agents.map(a => {
                    const assigned = customers.filter(c => c.agentId === a.id);
                    const totalBalance = assigned.reduce((s, c) => s + c.totalBalance, 0);
                    return (
                      <div key={a.id} className="rounded-md border p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{a.name}</div>
                          <div className="text-xs text-muted-foreground">{assigned.length} customers • Balance: {formatIntMoney(totalBalance)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  );
}
