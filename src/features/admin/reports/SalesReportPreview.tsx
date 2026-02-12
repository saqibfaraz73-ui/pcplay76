import * as React from "react";
import type { CreditCustomer, DeliveryPerson, Expense, MenuItem, Order, RestaurantTable, Settings, TableOrder, Waiter } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportOrderList } from "@/features/admin/reports/ReportOrderList";

type Props = {
  restaurantName: string;
  fromLabel: string;
  toLabel: string;
  orders: Order[];
  customers: CreditCustomer[];
  deliveryPersons: DeliveryPerson[];
  items: MenuItem[];
  expenses?: Expense[];
  tableOrders?: TableOrder[];
  tables?: RestaurantTable[];
  settings?: Settings | null;
  waiters?: Waiter[];
};

export function SalesReportPreview({ 
  restaurantName, 
  fromLabel, 
  toLabel, 
  orders, 
  customers, 
  deliveryPersons, 
  items, 
  expenses = [],
  tableOrders = [],
  tables = [],
  waiters = [],
  settings,
}: Props) {
  const deliveryEnabled = settings?.deliveryEnabled ?? true;
  const tableEnabled = settings?.tableManagementEnabled ?? true;

  const completed = React.useMemo(() => orders.filter((o) => o.status === "completed"), [orders]);
  const cancelled = React.useMemo(() => orders.filter((o) => o.status === "cancelled"), [orders]);

  // Table orders
  const completedTableOrders = React.useMemo(() => tableOrders.filter((o) => o.status === "completed"), [tableOrders]);
  const cancelledTableOrders = React.useMemo(() => tableOrders.filter((o) => o.status === "cancelled"), [tableOrders]);
  const tableSalesTotal = React.useMemo(() => completedTableOrders.reduce((s, o) => s + o.total, 0), [completedTableOrders]);
  const tableSalesGross = React.useMemo(() => completedTableOrders.reduce((s, o) => s + o.subtotal, 0), [completedTableOrders]);
  const tableCancelledTotal = React.useMemo(() => cancelledTableOrders.reduce((s, o) => s + o.total, 0), [cancelledTableOrders]);
  const tableDiscountTotal = React.useMemo(() => completedTableOrders.reduce((s, o) => s + o.discountTotal, 0), [completedTableOrders]);
  const tableCreditSales = React.useMemo(
    () => completedTableOrders.filter((o) => o.paymentMethod === "credit").reduce((s, o) => s + o.total, 0),
    [completedTableOrders],
  );
  const tableCashSales = React.useMemo(
    () => completedTableOrders.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.total, 0),
    [completedTableOrders],
  );

  // Combined totals (regular orders + table orders)
  const gross = React.useMemo(() => completed.reduce((s, o) => s + o.subtotal, 0) + tableSalesGross, [completed, tableSalesGross]);
  const discount = React.useMemo(() => completed.reduce((s, o) => s + o.discountTotal, 0) + tableDiscountTotal, [completed, tableDiscountTotal]);
  const net = React.useMemo(() => completed.reduce((s, o) => s + o.total, 0) + tableSalesTotal, [completed, tableSalesTotal]);

  const cancelledTotal = React.useMemo(() => cancelled.reduce((s, o) => s + o.total, 0) + tableCancelledTotal, [cancelled, tableCancelledTotal]);

  const totalExpenses = React.useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const netAfterExpenses = net - totalExpenses;

  const creditSale = React.useMemo(
    () => completed.filter((o) => o.paymentMethod === "credit").reduce((s, o) => s + o.total, 0) + tableCreditSales,
    [completed, tableCreditSales],
  );
  const cashSale = React.useMemo(
    () => completed.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.total, 0) + tableCashSales,
    [completed, tableCashSales],
  );
  const deliverySale = React.useMemo(
    () => completed.filter((o) => o.paymentMethod === "delivery").reduce((s, o) => s + o.total, 0),
    [completed],
  );
  const deliveryCancelled = React.useMemo(
    () => cancelled.filter((o) => o.paymentMethod === "delivery").reduce((s, o) => s + o.total, 0),
    [cancelled],
  );



  const customersById = React.useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const itemsById = React.useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const deliveryPersonsById = React.useMemo(() => Object.fromEntries(deliveryPersons.map((p) => [p.id, p])), [deliveryPersons]);
  const tablesById = React.useMemo(() => Object.fromEntries(tables.map((t) => [t.id, t])), [tables]);
  const waitersById = React.useMemo(() => Object.fromEntries(waiters.map((w) => [w.id, w])), [waiters]);

  // Delivery sales by person
  const deliveryByPerson = React.useMemo(() => {
    const byPerson: Record<string, { personId: string; total: number; count: number }> = {};
    for (const o of completed) {
      if (o.paymentMethod !== "delivery" || !o.deliveryPersonId) continue;
      const pid = o.deliveryPersonId;
      if (!byPerson[pid]) byPerson[pid] = { personId: pid, total: 0, count: 0 };
      byPerson[pid].total += o.total;
      byPerson[pid].count += 1;
    }
    return Object.values(byPerson).sort((a, b) => b.total - a.total);
  }, [completed]);
  const creditByCustomer = React.useMemo(() => {
    const byCust: Record<string, { customerId: string; total: number; lines: Record<string, { name: string; qty: number; total: number }> }> = {};
    const addOrders = (list: Array<{ paymentMethod?: string; creditCustomerId?: string; total: number; lines: Array<{ itemId: string; name: string; qty: number; subtotal: number }> }>) => {
      for (const o of list) {
        if (o.paymentMethod !== "credit") continue;
        const cid = (o as any).creditCustomerId;
        if (!cid) continue;
        if (!byCust[cid]) byCust[cid] = { customerId: cid, total: 0, lines: {} };
        byCust[cid].total += o.total;
        for (const l of o.lines) {
          const existing = byCust[cid].lines[l.itemId];
          byCust[cid].lines[l.itemId] = {
            name: l.name,
            qty: (existing?.qty ?? 0) + l.qty,
            total: (existing?.total ?? 0) + l.subtotal,
          };
        }
      }
    };
    addOrders(completed);
    addOrders(completedTableOrders);
    return Object.values(byCust).sort((a, b) => (customersById[a.customerId]?.name ?? "").localeCompare(customersById[b.customerId]?.name ?? ""));
  }, [completed, completedTableOrders, customersById]);

  const itemsSales = React.useMemo(() => {
    const byItem: Record<string, { itemId: string; name: string; qty: number; revenue: number; profit: number }> = {};
    const addLines = (list: Array<{ lines: Array<{ itemId: string; name: string; qty: number; unitPrice: number; subtotal: number }> }>) => {
      for (const o of list) {
        for (const l of o.lines) {
          const item = itemsById[l.itemId];
          const buying = item?.buyingPrice ?? 0;
          if (!byItem[l.itemId]) {
            byItem[l.itemId] = { itemId: l.itemId, name: l.name, qty: 0, revenue: 0, profit: 0 };
          }
          byItem[l.itemId].qty += l.qty;
          byItem[l.itemId].revenue += l.subtotal;
          if (item?.buyingPrice != null) {
            byItem[l.itemId].profit += (l.unitPrice - buying) * l.qty;
          }
        }
      }
    };
    addLines(completed);
    addLines(completedTableOrders);
    return Object.values(byItem).sort((a, b) => b.revenue - a.revenue);
  }, [completed, completedTableOrders, itemsById]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Report</CardTitle>
        <CardDescription>
          {restaurantName} • {fromLabel} → {toLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Completed orders</div>
            <div className="text-base font-semibold">{completed.length + completedTableOrders.length}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Cancelled orders</div>
            <div className="text-base font-semibold">{cancelled.length + cancelledTableOrders.length}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Cancelled amount</div>
            <div className="text-base font-semibold text-destructive">{formatIntMoney(cancelledTotal)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Gross subtotal</div>
            <div className="text-base font-semibold">{formatIntMoney(gross)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Total discount</div>
            <div className="text-base font-semibold">{formatIntMoney(discount)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Net total</div>
            <div className="text-base font-semibold">{formatIntMoney(net)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Credit sale</div>
            <div className="text-base font-semibold">{formatIntMoney(creditSale)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Cash sale</div>
            <div className="text-base font-semibold">{formatIntMoney(cashSale)}</div>
          </div>
          {deliveryEnabled && deliverySale > 0 && (
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Delivery sale</div>
              <div className="text-base font-semibold">{formatIntMoney(deliverySale)}</div>
            </div>
          )}
          {deliveryEnabled && deliveryCancelled > 0 && (
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Delivery cancelled</div>
              <div className="text-base font-semibold text-destructive">{formatIntMoney(deliveryCancelled)}</div>
            </div>
          )}
        </div>

        {/* Table Sales Section */}
        {tableEnabled && tableOrders.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Table Sales</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Completed table orders</div>
                <div className="text-base font-semibold">{completedTableOrders.length}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Table sales total</div>
                <div className="text-base font-semibold">{formatIntMoney(tableSalesTotal)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Table discounts</div>
                <div className="text-base font-semibold">{formatIntMoney(tableDiscountTotal)}</div>
              </div>
              {cancelledTableOrders.length > 0 && (
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Cancelled table orders</div>
                  <div className="text-base font-semibold text-destructive">{cancelledTableOrders.length} ({formatIntMoney(tableCancelledTotal)})</div>
                </div>
              )}
              {tableCashSales > 0 && (
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Table cash sales</div>
                  <div className="text-base font-semibold">{formatIntMoney(tableCashSales)}</div>
                </div>
              )}
              {tableCreditSales > 0 && (
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Table credit sales</div>
                  <div className="text-base font-semibold">{formatIntMoney(tableCreditSales)}</div>
                </div>
              )}
            </div>

            {/* Table orders list */}
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Table</th>
                    <th className="px-3 py-2 font-medium">Waiter</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Status</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Payment</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {tableOrders.map((o, idx) => (
                    <tr key={o.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">{tablesById[o.tableId]?.tableNumber ?? o.tableId}</td>
                      <td className="px-3 py-2">{waitersById[o.waiterId]?.name ?? o.waiterId}</td>
                      <td className={`whitespace-nowrap px-3 py-2 ${o.status === "cancelled" ? "text-destructive" : ""}`}>
                        {o.status}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{o.paymentMethod ?? "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{formatIntMoney(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delivery sales by person */}
        {deliveryEnabled && deliveryByPerson.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Delivery Sales by Person</div>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Delivery Person</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Orders</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryByPerson.map((p) => (
                    <tr key={p.personId} className="border-t">
                      <td className="px-3 py-2">{deliveryPersonsById[p.personId]?.name ?? p.personId}</td>
                      <td className="whitespace-nowrap px-3 py-2">{p.count}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatIntMoney(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Expenses summary */}
        {expenses.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Expenses</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Total Expenses</div>
                <div className="text-base font-semibold text-destructive">{formatIntMoney(totalExpenses)}</div>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="text-xs text-muted-foreground">Net After Expenses</div>
                <div className="text-base font-bold">{formatIntMoney(netAfterExpenses)}</div>
              </div>
            </div>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Expense</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e, idx) => (
                    <tr key={e.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        {e.name}
                        {e.note && <span className="text-xs text-muted-foreground ml-1">({e.note})</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-destructive font-medium">{formatIntMoney(e.amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Credit customer breakdown (totals only — item details in Credit Lodge) */}
        {creditByCustomer.length ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Credit Customers</div>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {creditByCustomer.map((c) => {
                    const name = customersById[c.customerId]?.name ?? c.customerId;
                    return (
                      <tr key={c.customerId} className="border-t">
                        <td className="px-3 py-2">{name}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{formatIntMoney(c.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Items Sales Report */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Items Sales Report</div>
          {itemsSales.length === 0 ? (
            <div className="text-sm text-muted-foreground">No completed orders in this range.</div>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Qty</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Revenue</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsSales.map((r) => (
                    <tr key={r.itemId} className="border-t">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.qty}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatIntMoney(r.revenue)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatIntMoney(r.profit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40 font-semibold">
                  <tr className="border-t">
                    <td className="px-3 py-2">Total</td>
                    <td className="whitespace-nowrap px-3 py-2">{itemsSales.reduce((s, r) => s + r.qty, 0)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatIntMoney(itemsSales.reduce((s, r) => s + r.revenue, 0))}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatIntMoney(itemsSales.reduce((s, r) => s + r.profit, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <ReportOrderList
          orders={orders}
          customersById={customersById}
          deliveryPersonsById={deliveryPersonsById}
          tableOrders={tableOrders}
          tablesById={tablesById}
          waitersById={waitersById}
        />
      </CardContent>
    </Card>
  );
}
