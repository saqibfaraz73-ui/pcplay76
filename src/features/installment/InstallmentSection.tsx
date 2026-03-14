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
import { Search, Plus, Edit, Trash2, CreditCard, History, UserCheck, UserX, Download, Upload, FileSpreadsheet, Share2, ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InstallmentCustomerForm } from "./InstallmentCustomerForm";
import { InstallmentPaymentDialog } from "./InstallmentPaymentDialog";
import { InstallmentPaymentHistory } from "./InstallmentPaymentHistory";
import { InstallmentReports } from "./InstallmentReports";
import { InstallmentAgentAssign } from "./InstallmentAgentAssign";
import { exportInstallmentExcel, importInstallmentExcel, downloadSampleExcel, exportAgentData, importAgentData } from "./installment-excel";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { buildInstallmentReceiptPdf, buildPaymentHistoryPdf } from "./installment-pdf";
import { sharePdfBytes, savePdfBytes, saveFileBlob, shareFileBlob } from "@/features/pos/share-utils";
import { canMakeSale, incrementSaleCount } from "@/features/licensing/licensing-db";

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
  const [filterTab, setFilterTab] = React.useState<"all" | "paid" | "unpaid">("all");

  // Dialogs
  const [formOpen, setFormOpen] = React.useState(false);
  const [editCustomer, setEditCustomer] = React.useState<InstallmentCustomer | undefined>();
  const [paymentCustomerId, setPaymentCustomerId] = React.useState<string | null>(null);
  const [historyCustomerId, setHistoryCustomerId] = React.useState<string | null>(null);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const isAdmin = session?.role === "admin";
  const isCashier = session?.role === "cashier";
  const isAgent = session?.role === "installment_agent" as any;
  const canEdit = isAdmin || isCashier;

  const currentMonth = getCurrentMonth();

  const refresh = React.useCallback(async () => {
    let custs = await db.installmentCustomers.orderBy("createdAt").toArray();
    // Agent only sees assigned customers
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

  // Check if customer has paid current month
  const isCurrentMonthPaid = React.useCallback((customerId: string) => {
    return payments.some(p => p.customerId === customerId && p.month === currentMonth);
  }, [payments, currentMonth]);

  // Filter customers
  const filtered = React.useMemo(() => {
    let list = customers;
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
    // Filter by paid/unpaid
    if (filterTab === "paid") {
      list = list.filter(c => isCurrentMonthPaid(c.id) || c.totalBalance <= 0);
    } else if (filterTab === "unpaid") {
      list = list.filter(c => !isCurrentMonthPaid(c.id) && c.totalBalance > 0);
    }
    return list;
  }, [customers, query, filterTab, isCurrentMonthPaid]);

  const openNew = () => { setEditCustomer(undefined); setFormOpen(true); };
  const openEdit = (c: InstallmentCustomer) => { setEditCustomer(c); setFormOpen(true); };

  const saveCustomer = async (c: InstallmentCustomer) => {
    // Check free limit for new customers only
    const isNew = !customers.some(x => x.id === c.id);
    if (isNew) {
      const check = await canMakeSale("installment");
      if (!check.allowed) {
        toast({ title: "Free limit reached", description: check.message, variant: "destructive" });
        return;
      }
    }
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

  const handleExport = async () => {
    try {
      const blob = exportInstallmentExcel(customers, payments);
      const fileName = `installment_data_${Date.now()}.xlsx`;
      await saveFileBlob(blob, fileName);
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
          // Update customer balance
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

  return (
    <Tabs defaultValue="customers">
      <TabsList className="flex w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="customers">Customers</TabsTrigger>
        {canEdit && <TabsTrigger value="reports">Reports</TabsTrigger>}
        {isAdmin && <TabsTrigger value="agents">Agents</TabsTrigger>}
      </TabsList>

      <TabsContent value="customers">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Installment Customers</CardTitle>
              <CardDescription>Manage installment plans and payments.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit && <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" /> New Customer</Button>}
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" /> Export</Button>
                  <Button variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">
                      <Upload className="h-4 w-4 mr-1" /> Import
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleImport(f); e.target.value = ""; }} />
                    </label>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSampleDownload}><FileSpreadsheet className="h-4 w-4 mr-1" /> Sample</Button>
                </>
              )}
              {isAgent && (
                <Button variant="outline" size="sm" onClick={handleAgentExport}><Download className="h-4 w-4 mr-1" /> Export My Data</Button>
              )}
              {isAdmin && (
                <Button variant="outline" size="sm" asChild>
                  <label className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-1" /> Import Agent Data
                    <input type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleAgentImport(f); e.target.value = ""; }} />
                  </label>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Search */}
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, phone, product, agent..." className="pl-9" />
                </div>
              </div>
              <div className="flex gap-1">
                {(["all", "paid", "unpaid"] as const).map(t => (
                  <Button key={t} variant={filterTab === t ? "default" : "outline"} size="sm" onClick={() => setFilterTab(t)} className="capitalize">
                    {t === "all" ? "All" : t === "paid" ? <><UserCheck className="h-3 w-3 mr-1" /> Paid</> : <><UserX className="h-3 w-3 mr-1" /> Unpaid</>}
                  </Button>
                ))}
              </div>
            </div>

            {/* Select all for agent assignment */}
            {isAdmin && filtered.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
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
                {selectedIds.size > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>Assign to Agent</Button>
                )}
              </div>
            )}

            {/* Customer list */}
            {filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                {query ? "No customers match your search." : "No installment customers yet. Add one to get started."}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(c => {
                  const paid = isCurrentMonthPaid(c.id);
                  const overdue = !paid && isPaymentOverdue(c);
                  const lateDays = overdue && c.dueDate ? Math.max(0, new Date().getDate() - c.dueDate) : 0;
                  const currentLateFee = lateDays > 0 && c.lateFeePerDay ? lateDays * c.lateFeePerDay : 0;
                  const completed = c.totalBalance <= 0;

                  return (
                    <div key={c.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          {isAdmin && (
                            <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="mt-1 rounded" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{c.name}</span>
                              {completed && <Badge variant="outline" className="text-green-600 border-green-600">Completed</Badge>}
                              {!completed && paid && <Badge variant="outline" className="text-green-600 border-green-600">Paid</Badge>}
                              {overdue && <Badge variant="destructive">Overdue ({lateDays}d)</Badge>}
                              {!completed && !paid && !overdue && <Badge variant="outline">Pending</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{c.phone}{c.agentName ? ` • Agent: ${c.agentName}` : ""}</div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {!completed && (
                            <Button size="sm" variant="outline" onClick={() => setPaymentCustomerId(c.id)}>
                              <CreditCard className="h-3 w-3 mr-1" /> Pay
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setHistoryCustomerId(c.id)}>
                            <History className="h-3 w-3" />
                          </Button>
                          {canEdit && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => void deleteCustomer(c)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Product & installment info */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded bg-muted/50 p-2">
                          <div className="text-muted-foreground">Product</div>
                          <div className="font-medium truncate">{c.productName}</div>
                        </div>
                        <div className="rounded bg-muted/50 p-2">
                          <div className="text-muted-foreground">Total Price</div>
                          <div className="font-semibold">{formatIntMoney(c.totalPrice)}</div>
                        </div>
                        <div className="rounded bg-muted/50 p-2">
                          <div className="text-muted-foreground">Monthly</div>
                          <div className="font-semibold">{formatIntMoney(c.monthlyInstallment)}</div>
                        </div>
                        <div className="rounded bg-muted/50 p-2">
                          <div className="text-muted-foreground">Balance</div>
                          <div className={`font-semibold ${c.totalBalance > 0 ? "text-destructive" : "text-green-600"}`}>
                            {formatIntMoney(c.totalBalance)}
                          </div>
                        </div>
                      </div>

                      {currentLateFee > 0 && (
                        <div className="text-xs text-destructive font-medium">
                          ⚠ Late fee: {formatIntMoney(currentLateFee)} ({lateDays} days × {formatIntMoney(c.lateFeePerDay ?? 0)}/day)
                        </div>
                      )}

                      {/* Images thumbnails */}
                      {c.images && c.images.length > 0 && (
                        <div className="flex gap-1 overflow-x-auto">
                          {c.images.slice(0, 4).map((img, i) => (
                            <img key={i} src={img} alt={`doc-${i}`} className="h-12 w-12 rounded border object-cover shrink-0" />
                          ))}
                          {c.images.length > 4 && <span className="text-xs text-muted-foreground self-center">+{c.images.length - 4}</span>}
                        </div>
                      )}
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
      </TabsContent>

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
