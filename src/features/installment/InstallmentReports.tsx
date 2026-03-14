import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import type { Settings, StaffAccount } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { buildInstallmentReportPdf } from "./installment-report-pdf";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";

interface Props {
  customers: InstallmentCustomer[];
  payments: InstallmentPayment[];
  agents: StaffAccount[];
  settings: Settings | null;
  agentMode?: boolean;
  agentName?: string;
}

function toDateInputValue(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(ts: number) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function endOfDay(ts: number) { const d = new Date(ts); d.setHours(23, 59, 59, 999); return d.getTime(); }
function parseDateInput(value: string): number {
  const [y, m, d] = value.split("-").map(x => parseInt(x, 10));
  return new Date(y, m - 1, d).getTime();
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function InstallmentReports({ customers, payments, agents, settings }: Props) {
  const now = Date.now();
  const [from, setFrom] = React.useState(toDateInputValue(startOfDay(now - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = React.useState(toDateInputValue(endOfDay(now)));
  const currentMonth = getCurrentMonth();

  const fromTs = startOfDay(parseDateInput(from));
  const toTs = endOfDay(parseDateInput(to));

  const filteredPayments = payments.filter(p => p.createdAt >= fromTs && p.createdAt <= toTs);

  // Totals
  const totalCustomerBalance = customers.reduce((s, c) => s + c.totalBalance, 0);
  const totalRecoveryThisMonth = customers.reduce((s, c) => s + c.monthlyInstallment, 0);
  const recoveredThisMonth = payments.filter(p => p.month === currentMonth).reduce((s, p) => s + p.amount, 0);
  const pendingRecovery = Math.max(0, totalRecoveryThisMonth - recoveredThisMonth);
  const totalLateFee = filteredPayments.reduce((s, p) => s + (p.lateFeeAmount ?? 0), 0);
  const totalLateFeeRecovered = totalLateFee; // late fee is collected at payment time
  const totalRecoveredInRange = filteredPayments.reduce((s, p) => s + p.amount, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>Installment Reports</CardTitle>
          <CardDescription>View recovery summaries by date range.</CardDescription>
        </div>
        <SaveShareMenu
          label="Report PDF"
          getDefaultFileName={() => `installment_report_${Date.now()}.pdf`}
          onSave={async (fn) => {
            const doc = buildInstallmentReportPdf({ customers, payments, filteredPayments, agents, settings, from, to });
            const bytes = doc.output("arraybuffer");
            await savePdfBytes(new Uint8Array(bytes), fn ?? `installment_report_${Date.now()}.pdf`);
          }}
          onShare={async () => {
            const doc = buildInstallmentReportPdf({ customers, payments, filteredPayments, agents, settings, from, to });
            const bytes = doc.output("arraybuffer");
            await sharePdfBytes(new Uint8Array(bytes), `installment_report_${Date.now()}.pdf`);
          }}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>From</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SummaryCard label="All Customers Balance" value={totalCustomerBalance} color="text-destructive" />
          <SummaryCard label="Recovery This Month" value={totalRecoveryThisMonth} />
          <SummaryCard label="Recovered This Month" value={recoveredThisMonth} color="text-green-600" />
          <SummaryCard label="Pending Recovery" value={pendingRecovery} color="text-destructive" />
          <SummaryCard label="Total Late Fee" value={totalLateFee} />
          <SummaryCard label="Late Fee Recovered" value={totalLateFeeRecovered} color="text-green-600" />
          <SummaryCard label={`Recovered (${from} to ${to})`} value={totalRecoveredInRange} color="text-green-600" />
        </div>

        {/* Per-agent breakdown */}
        {agents.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-2">Agent Performance</h3>
            <div className="space-y-2">
              {agents.map(agent => {
                const agentCustomers = customers.filter(c => c.agentId === agent.id);
                const agentPaymentsInRange = filteredPayments.filter(p =>
                  agentCustomers.some(c => c.id === p.customerId)
                );
                const agentRecovered = agentPaymentsInRange.reduce((s, p) => s + p.amount, 0);
                const agentTotalBalance = agentCustomers.reduce((s, c) => s + c.totalBalance, 0);
                const agentPending = agentCustomers
                  .filter(c => !payments.some(p => p.customerId === c.id && p.month === currentMonth) && c.totalBalance > 0)
                  .reduce((s, c) => s + c.monthlyInstallment, 0);

                // Commission calculation
                let commission = 0;
                for (const c of agentCustomers) {
                  const custPayments = agentPaymentsInRange.filter(p => p.customerId === c.id);
                  for (const p of custPayments) {
                    if (c.agentCommissionType === "percent" && c.agentCommissionValue) {
                      commission += Math.round(p.amount * c.agentCommissionValue / 100);
                    } else if (c.agentCommissionType === "fixed" && c.agentCommissionValue) {
                      commission += c.agentCommissionValue;
                    }
                  }
                }

                return (
                  <div key={agent.id} className="rounded-md border p-3">
                    <div className="font-medium text-sm mb-2">{agent.name}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-muted-foreground">Customers</div>
                        <div className="font-bold">{agentCustomers.length}</div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-muted-foreground">Recovered</div>
                        <div className="font-bold text-green-600">{formatIntMoney(agentRecovered)}</div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-muted-foreground">Pending</div>
                        <div className="font-bold text-destructive">{formatIntMoney(agentPending)}</div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-muted-foreground">Commission</div>
                        <div className="font-bold">{formatIntMoney(commission)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${color ?? ""}`}>{formatIntMoney(value)}</div>
    </div>
  );
}
