import * as React from "react";
import type { CreditCustomer, DeliveryPerson, Order, RestaurantTable, TableOrder, Waiter } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

// Convert TableOrder to Order shape for ReceiptDialog
function tableOrderToOrder(t: TableOrder, tablesById: Record<string, RestaurantTable>, waitersById: Record<string, Waiter>): Order {
  const waiterName = waitersById[t.waiterId]?.name;
  return {
    id: t.id,
    receiptNo: t.receiptNo ?? 0,
    cashier: t.cashier ?? (waiterName ? `Waiter: ${waiterName}` : "Unknown"),
    status: t.status as "completed" | "cancelled",
    paymentMethod: (t.paymentMethod ?? "cash") as any,
    creditCustomerId: t.creditCustomerId,
    discount: t.discountTotal > 0 ? { type: "amount", value: t.discountTotal } : { type: "none" },
    lines: t.lines.map((l) => ({
      itemId: l.itemId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, subtotal: l.subtotal,
    })),
    subtotal: t.subtotal,
    discountTotal: t.discountTotal,
    taxAmount: t.taxAmount,
    serviceChargeAmount: t.serviceChargeAmount,
    total: t.total,
    cancelledReason: t.cancelledReason,
    workPeriodId: t.workPeriodId,
    createdAt: t.completedAt ?? t.createdAt,
    updatedAt: t.updatedAt,
  };
}

type UnifiedEntry = {
  id: string;
  order: Order;
  source: "regular" | "table";
  tableNumber?: string;
  waiterName?: string;
};

type Props = {
  orders: Order[];
  customersById?: Record<string, CreditCustomer>;
  deliveryPersonsById?: Record<string, DeliveryPerson>;
  tableOrders?: TableOrder[];
  tablesById?: Record<string, RestaurantTable>;
  waitersById?: Record<string, Waiter>;
};

export function ReportOrderList({ orders, customersById, deliveryPersonsById, tableOrders = [], tablesById = {}, waitersById = {} }: Props) {
  const unified = React.useMemo<UnifiedEntry[]>(() => {
    const regular: UnifiedEntry[] = orders.map((o) => ({ id: o.id, order: o, source: "regular" }));
    const table: UnifiedEntry[] = tableOrders
      .filter((t) => t.receiptNo != null)
      .map((t) => ({
        id: t.id,
        order: tableOrderToOrder(t, tablesById, waitersById),
        source: "table",
        tableNumber: tablesById[t.tableId]?.tableNumber,
        waiterName: waitersById[t.waiterId]?.name,
      }));
    return [...regular, ...table].sort((a, b) => b.order.createdAt - a.order.createdAt);
  }, [orders, tableOrders, tablesById, waitersById]);

  if (unified.length === 0) {
    return <div className="text-sm text-muted-foreground">No orders found for this range.</div>;
  }

  const getPaymentLabel = (order: Order) => {
    if (order.paymentMethod === "credit" && order.creditCustomerId && customersById) {
      return `Credit: ${customersById[order.creditCustomerId]?.name ?? "Unknown"}`;
    }
    if (order.paymentMethod === "delivery" && order.deliveryPersonId && deliveryPersonsById) {
      return `Delivery: ${deliveryPersonsById[order.deliveryPersonId]?.name ?? "Unknown"}`;
    }
    return order.paymentMethod.toUpperCase();
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">Orders ({unified.length})</div>
      <Accordion type="single" collapsible className="w-full">
        {unified.map((entry) => {
          const o = entry.order;
          const when = new Date(o.createdAt).toLocaleString();
          return (
            <AccordionItem key={entry.id} value={entry.id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 text-sm w-full pr-4">
                  <span className="font-medium">#{o.receiptNo}</span>
                  {entry.source === "table" && (
                    <span className="text-xs text-muted-foreground">
                      (Table{entry.tableNumber ? ` ${entry.tableNumber}` : ""}{entry.waiterName ? ` • ${entry.waiterName}` : ""})
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">{when}</span>
                  <Badge 
                    variant={o.status === "cancelled" ? "destructive" : "secondary"} 
                    className="ml-auto"
                  >
                    {o.status}
                  </Badge>
                  <span className="font-semibold">{formatIntMoney(o.total)}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border p-2">
                      <div className="text-xs text-muted-foreground">Payment</div>
                      <div className="text-sm font-medium">{getPaymentLabel(o)}</div>
                    </div>
                    <div className="rounded-md border p-2">
                      <div className="text-xs text-muted-foreground">Cashier</div>
                      <div className="text-sm font-medium">{o.cashier}</div>
                    </div>
                    <div className="rounded-md border p-2">
                      <div className="text-xs text-muted-foreground">Subtotal</div>
                      <div className="text-sm font-medium">{formatIntMoney(o.subtotal)}</div>
                    </div>
                    {o.discountTotal > 0 && (
                      <div className="rounded-md border p-2">
                        <div className="text-xs text-muted-foreground">Discount</div>
                        <div className="text-sm font-medium text-destructive">-{formatIntMoney(o.discountTotal)}</div>
                      </div>
                    )}
                  </div>

                  {o.paymentMethod === "delivery" && (o.deliveryCustomerName || o.deliveryCustomerAddress || o.deliveryCustomerPhone) && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">Delivery Info</div>
                      {o.deliveryCustomerName && <div className="text-sm">Customer: {o.deliveryCustomerName}</div>}
                      {o.deliveryCustomerAddress && <div className="text-sm">Address: {o.deliveryCustomerAddress}</div>}
                      {o.deliveryCustomerPhone && <div className="text-sm">Phone: {o.deliveryCustomerPhone}</div>}
                    </div>
                  )}

                  {o.status === "cancelled" && o.cancelledReason && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                      <div className="text-xs font-medium text-destructive">Cancellation Reason</div>
                      <div className="text-sm">{o.cancelledReason}</div>
                    </div>
                  )}

                  <div className="overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Item</th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium text-right">Qty</th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium text-right">Price</th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.lines.map((l, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2">{l.name}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">{l.qty}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">{formatIntMoney(l.unitPrice)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">{formatIntMoney(l.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end">
                    <ReceiptDialog order={o} customersById={customersById} deliveryPersonsById={deliveryPersonsById} triggerLabel="View Receipt" />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
