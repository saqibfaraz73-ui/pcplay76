import * as React from "react";
import type { CreditCustomer, CreditPayment, Order } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportOrderList } from "@/features/admin/reports/ReportOrderList";

type Props = {
  restaurantName: string;
  fromLabel: string;
  toLabel: string;
  customer: CreditCustomer;
  orders: Order[];
  payments?: CreditPayment[];
};

export function CreditLodgePreview({ restaurantName, fromLabel, toLabel, customer, orders, payments = [] }: Props) {
  const completed = React.useMemo(() => orders.filter((o) => o.status === "completed"), [orders]);
  const cancelled = React.useMemo(() => orders.filter((o) => o.status === "cancelled"), [orders]);
  const totalCredit = React.useMemo(() => completed.reduce((s, o) => s + o.total, 0), [completed]);
  const totalPaid = React.useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);
  const balance = totalCredit - totalPaid;

  const itemsSummary = React.useMemo(() => {
    const byItem: Record<string, { name: string; qty: number; total: number }> = {};
    for (const o of completed) {
      for (const l of o.lines) {
        const existing = byItem[l.itemId];
        byItem[l.itemId] = {
          name: l.name,
          qty: (existing?.qty ?? 0) + l.qty,
          total: (existing?.total ?? 0) + l.subtotal,
        };
      }
    }
    return Object.values(byItem).sort((a, b) => b.total - a.total);
  }, [completed]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit Customer Lodge</CardTitle>
        <CardDescription>
          {restaurantName} • {customer.name}
          {customer.mobile ? ` (${customer.mobile})` : ""} • {fromLabel} → {toLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Completed</div>
            <div className="text-base font-semibold">{completed.length}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Cancelled</div>
            <div className="text-base font-semibold">{cancelled.length}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Total Credit</div>
            <div className="text-base font-semibold">{formatIntMoney(totalCredit)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Total Paid</div>
            <div className="text-base font-semibold text-green-600">{formatIntMoney(totalPaid)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Balance Due</div>
            <div className={`text-base font-semibold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
              {formatIntMoney(balance)}
            </div>
          </div>
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Payment History</div>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {payments
                    .slice()
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2">{new Date(p.createdAt).toLocaleString()}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-green-600 font-medium">+{formatIntMoney(p.amount)}</td>
                        <td className="px-3 py-2">{p.note || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {itemsSummary.length ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Items</div>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Qty</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsSummary.map((r) => (
                    <tr key={r.name} className="border-t">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.qty}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatIntMoney(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <ReportOrderList orders={orders} customersById={{ [customer.id]: customer }} />
      </CardContent>
    </Card>
  );
}
