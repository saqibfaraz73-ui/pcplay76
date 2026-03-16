import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, Users, CheckCircle, AlertTriangle } from "lucide-react";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import type { StaffAccount } from "@/db/schema";
import { formatIntMoney, fmtDate } from "@/features/pos/format";
import { useToast } from "@/hooks/use-toast";
import { importAgentData } from "./installment-excel";
import { db } from "@/db/appDb";

interface Props {
  customers: InstallmentCustomer[];
  payments: InstallmentPayment[];
  agents: StaffAccount[];
  onRefresh: () => void;
}

function toDateInput(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDate(v: string) {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function InstallmentAgentView({ customers, payments, agents, onRefresh }: Props) {
  const { toast } = useToast();
  const now = Date.now();
  const [agentId, setAgentId] = React.useState("__all");
  const [from, setFrom] = React.useState(toDateInput(now - 30 * 86400000));
  const [to, setTo] = React.useState(toDateInput(now));
  const [statusFilter, setStatusFilter] = React.useState<"all" | "paid" | "unpaid">("all");

  const fromTs = parseDate(from).getTime();
  const toTs = parseDate(to).setHours(23, 59, 59, 999);

  const agentCustomers = React.useMemo(() => {
    if (agentId === "__all") return customers;
    if (agentId === "__unassigned") return customers.filter(c => !c.agentId);
    return customers.filter(c => c.agentId === agentId);
  }, [customers, agentId]);

  const rangePayments = React.useMemo(() =>
    payments.filter(p => p.createdAt >= fromTs && p.createdAt <= toTs),
    [payments, fromTs, toTs]
  );

  const paidCustIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const p of rangePayments) {
      if (agentCustomers.some(c => c.id === p.customerId)) ids.add(p.customerId);
    }
    return ids;
  }, [rangePayments, agentCustomers]);

  const displayList = React.useMemo(() => {
    if (statusFilter === "paid") return agentCustomers.filter(c => paidCustIds.has(c.id));
    if (statusFilter === "unpaid") return agentCustomers.filter(c => !paidCustIds.has(c.id) && c.totalBalance > 0);
    return agentCustomers;
  }, [agentCustomers, statusFilter, paidCustIds]);

  const totalPaid = rangePayments
    .filter(p => agentCustomers.some(c => c.id === p.customerId))
    .reduce((s, p) => s + p.amount, 0);
  const totalBalance = agentCustomers.reduce((s, c) => s + c.totalBalance, 0);
  const paidCount = paidCustIds.size;
  const unpaidCount = agentCustomers.filter(c => !paidCustIds.has(c.id) && c.totalBalance > 0).length;

  const handleAgentDataImport = async (file: File) => {
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
      onRefresh();
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Agent-wise Customer View</CardTitle>
        <CardDescription className="text-xs">Select agent, filter by paid/unpaid in date range, and upload collection data.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Select Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Agents</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({customers.filter(c => c.agentId === a.id).length})</SelectItem>
                ))}
                <SelectItem value="__unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" className="h-9 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" className="h-9 text-sm" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-md border p-2">
            <div className="text-[10px] text-muted-foreground">Customers</div>
            <div className="font-bold text-sm">{agentCustomers.length}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-[10px] text-muted-foreground">Paid</div>
            <div className="font-bold text-sm text-green-600">{paidCount}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-[10px] text-muted-foreground">Unpaid</div>
            <div className="font-bold text-sm text-destructive">{unpaidCount}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-[10px] text-muted-foreground">Recovered</div>
            <div className="font-bold text-sm text-green-600">{formatIntMoney(totalPaid)}</div>
          </div>
        </div>

        {/* Upload agent data */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <label className="cursor-pointer">
              <Upload className="h-3 w-3 mr-1" /> Upload Agent Collection Data
              <input type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleAgentDataImport(f); e.target.value = ""; }} />
            </label>
          </Button>
        </div>

        {/* Customer list */}
        {displayList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No customers found for selected filters.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {displayList.map(c => {
              const isPaid = paidCustIds.has(c.id);
              const custPayments = rangePayments.filter(p => p.customerId === c.id);
              const custRecovered = custPayments.reduce((s, p) => s + p.amount, 0);
              return (
                <div key={c.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        {c.name}
                        {isPaid ? (
                          <Badge variant="default" className="text-[10px] h-4 bg-green-600"><CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Paid</Badge>
                        ) : c.totalBalance > 0 ? (
                          <Badge variant="destructive" className="text-[10px] h-4"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Unpaid</Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {c.productName} • {c.agentName ?? "Unassigned"}
                        {c.phone && ` • ${c.phone}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Balance</div>
                      <div className="font-bold text-sm text-destructive">{formatIntMoney(c.totalBalance)}</div>
                    </div>
                  </div>
                  {custPayments.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1 border-t pt-1">
                      Recovered in range: <span className="text-green-600 font-medium">{formatIntMoney(custRecovered)}</span> ({custPayments.length} payments)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
