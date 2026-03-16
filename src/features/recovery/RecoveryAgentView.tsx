import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, CheckCircle, AlertTriangle } from "lucide-react";
import type { RecoveryCustomer, RecoveryPayment, StaffAccount } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/db/appDb";
import { format } from "date-fns";

interface Props {
  customers: RecoveryCustomer[];
  payments: RecoveryPayment[];
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

export function RecoveryAgentView({ customers, payments, agents, onRefresh }: Props) {
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
      if (p.status === "paid" && agentCustomers.some(c => c.id === p.customerId)) ids.add(p.customerId);
    }
    return ids;
  }, [rangePayments, agentCustomers]);

  const displayList = React.useMemo(() => {
    if (statusFilter === "paid") return agentCustomers.filter(c => paidCustIds.has(c.id));
    if (statusFilter === "unpaid") return agentCustomers.filter(c => !paidCustIds.has(c.id));
    return agentCustomers;
  }, [agentCustomers, statusFilter, paidCustIds]);

  const totalPaid = rangePayments
    .filter(p => p.status === "paid" && agentCustomers.some(c => c.id === p.customerId))
    .reduce((s, p) => s + p.amount, 0);
  const totalBalance = agentCustomers.reduce((s, c) => s + c.balance, 0);
  const paidCount = paidCustIds.size;
  const unpaidCount = agentCustomers.filter(c => !paidCustIds.has(c.id)).length;

  const handleCollectAgentData = async (files: FileList) => {
    let totalImported = 0, totalPayments = 0;
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

        const existingCustIds = new Set((await db.recoveryCustomers.toArray()).map(c => c.id));
        const existingPayIds = new Set((await db.recoveryPayments.toArray()).map(p => p.id));

        for (const c of importCusts) {
          if (existingCustIds.has(c.id)) {
            const existing = await db.recoveryCustomers.get(c.id);
            if (existing && c.balance !== existing.balance) {
              await db.recoveryCustomers.update(c.id, { balance: c.balance, lastBillingAt: c.lastBillingAt });
            }
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
    toast({ title: `Collected: ${totalImported} new customers, ${totalPayments} payments` });
    onRefresh();
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
              <input type="file" accept=".json" multiple className="hidden" onChange={e => { if (e.target.files?.length) void handleCollectAgentData(e.target.files); e.target.value = ""; }} />
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
              const custPayments = rangePayments.filter(p => p.customerId === c.id && p.status === "paid");
              const custRecovered = custPayments.reduce((s, p) => s + p.amount, 0);
              return (
                <div key={c.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        {c.name}
                        {isPaid ? (
                          <Badge variant="default" className="text-[10px] h-4 bg-green-600"><CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Paid</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] h-4"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Unpaid</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {c.pkg ?? "No package"} • {c.agentName ?? "Unassigned"}
                        {c.contact && ` • ${c.contact}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Balance</div>
                      <div className="font-bold text-sm text-destructive">{formatIntMoney(c.balance)}</div>
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
