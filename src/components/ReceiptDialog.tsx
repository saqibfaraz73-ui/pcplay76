import * as React from "react";
import type { CreditCustomer, DeliveryPerson, Order, ReceiptSize, Settings } from "@/db/schema";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatIntMoney } from "@/features/pos/format";
import { printReceiptFromOrder } from "@/features/pos/receipt-print";
import { useToast } from "@/hooks/use-toast";
import { Printer, Share2 } from "lucide-react";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import jsPDF from "jspdf";
import { writePdfFile, shareFile } from "@/features/files/sangi-folders";
import { db } from "@/db/appDb";
import { format } from "date-fns";

type Props = {
  order: Order;
  customersById?: Record<string, CreditCustomer>;
  deliveryPersonsById?: Record<string, DeliveryPerson>;
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

// 1pt = 1/72 inch, so 2 inches = 144pt
const RECEIPT_SIZE_PT: Record<ReceiptSize, [number, number]> = {
  "2x2": [144, 144],
  "2x3": [144, 216],
  "2x4": [144, 288],
  "2x5": [144, 360],
};

function buildReceiptPdf(order: Order, opts?: { creditCustomerName?: string; deliveryPersonName?: string; receiptSize?: ReceiptSize; settings?: Settings | null }) {
  const size = opts?.receiptSize ?? "2x3";
  const [pdfW, pdfH] = RECEIPT_SIZE_PT[size];
  const doc = new jsPDF({ unit: "pt", format: [pdfW, pdfH] });
  const left = 6;
  const width = pdfW - 12;
  let y = 14;
  const lineH = 10;

  const line = (text: string, bold = false, size = 7) => {
    doc.setFontSize(size);
    if (bold) doc.setFont("helvetica", "bold");
    else doc.setFont("helvetica", "normal");
    doc.text(text, left, y);
    y += lineH;
  };

  const rightLine = (leftText: string, rightText: string, bold = false) => {
    doc.setFontSize(7);
    if (bold) doc.setFont("helvetica", "bold");
    else doc.setFont("helvetica", "normal");
    doc.text(leftText, left, y);
    doc.text(rightText, left + width, y, { align: "right" });
    y += lineH;
  };

  const hr = () => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(left, y - 3, left + width, y - 3);
  };

  const when = new Date(order.createdAt).toLocaleString();
  let payLabel = order.paymentMethod.toUpperCase();
  if (order.paymentMethod === "credit" && opts?.creditCustomerName) {
    payLabel = `CREDIT: ${opts.creditCustomerName}`;
  } else if (order.paymentMethod === "delivery" && opts?.deliveryPersonName) {
    payLabel = `DELIVERY: ${opts.deliveryPersonName}`;
  }

  line(`Receipt #${order.receiptNo}`, true, 9);
  line(`Date: ${when}`);
  line(`Cashier: ${order.cashier}`);
  line(`Payment: ${payLabel}`);
  
  // Delivery customer info
  if (order.paymentMethod === "delivery") {
    if (order.deliveryCustomerName) line(`Customer: ${order.deliveryCustomerName}`);
    if (order.deliveryCustomerAddress) line(`Address: ${order.deliveryCustomerAddress}`);
    if (order.deliveryCustomerPhone) line(`Phone: ${order.deliveryCustomerPhone}`);
  }
  
  y += 2;
  hr();
  y += 2;

  for (const l of order.lines) {
    if (y + lineH * 3 > pdfH - 20) {
      doc.addPage([pdfW, pdfH] as any);
      y = 14;
    }
    rightLine(l.name, `${l.qty} x ${formatIntMoney(l.unitPrice)}`);
    rightLine("", formatIntMoney(l.subtotal), true);
    // Show expiry date if enabled
    if (opts?.settings?.showExpiryOnReceipt && l.expiryDate) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text(`Exp: ${format(new Date(l.expiryDate), "dd/MM/yy")}`, left + 4, y);
      y += lineH * 0.8;
    }
  }

  y += 2;
  hr();
  y += 2;

  rightLine("Subtotal", formatIntMoney(order.subtotal));
  rightLine("Discount", formatIntMoney(order.discountTotal));
  if ((order.taxAmount ?? 0) > 0) {
    rightLine("Tax", formatIntMoney(order.taxAmount));
  }
  if ((order.serviceChargeAmount ?? 0) > 0) {
    rightLine("Service", formatIntMoney(order.serviceChargeAmount));
  }
  rightLine("Total", formatIntMoney(order.total), true);

  y += 4;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Thank you!", left + width / 2, Math.min(y, pdfH - 8), { align: "center" });

  return doc;
}

export function ReceiptDialog({
  order,
  customersById,
  deliveryPersonsById,
  triggerLabel = "Open",
  triggerVariant = "outline",
  triggerSize = "sm",
  open,
  onOpenChange,
  hideTrigger,
}: Props) {
  const { toast } = useToast();
  const when = new Date(order.createdAt).toLocaleString();
  const customerName = order.creditCustomerId ? customersById?.[order.creditCustomerId]?.name : undefined;
  const deliveryPersonName = order.deliveryPersonId ? deliveryPersonsById?.[order.deliveryPersonId]?.name : undefined;

  const onPrint = React.useCallback(async () => {
    try {
      await printReceiptFromOrder(order);
      toast({ title: "Receipt printed" });
    } catch (e: any) {
      toast({ title: "Could not print", description: e?.message ?? String(e), variant: "destructive" });
    }
  }, [customerName, deliveryPersonName, order, toast]);

  const onShare = React.useCallback(async () => {
    try {
      const settings = await db.settings.get("app");
      const receiptSize = settings?.receiptSize ?? "2x3";
      const doc = buildReceiptPdf(order, { creditCustomerName: customerName, deliveryPersonName, receiptSize, settings: settings ?? null });
      const bytes = doc.output("arraybuffer");
      const fileName = `receipt_${order.receiptNo}_${Date.now()}.pdf`;

      if (Capacitor.isNativePlatform()) {
        const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
        await shareFile({ title: `Receipt #${order.receiptNo}`, uri: saved.uri });
      } else {
        // Web fallback - download PDF
        doc.save(fileName);
        toast({ title: "Receipt PDF downloaded" });
      }
    } catch (e: any) {
      toast({ title: "Could not share", description: e?.message ?? String(e), variant: "destructive" });
    }
  }, [customerName, deliveryPersonName, order, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {hideTrigger ? null : (
        <DialogTrigger asChild>
          <Button variant={triggerVariant} size={triggerSize}>
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receipt {order.receiptNo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted-foreground">Date</div>
                <div className="font-medium">{when}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Cashier</div>
                <div className="font-medium">{order.cashier}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Payment</div>
                <div className="font-medium">
                  {order.paymentMethod.toUpperCase()}
                  {order.paymentMethod === "credit" ? (customerName ? ` • ${customerName}` : "") : ""}
                  {order.paymentMethod === "delivery" ? (deliveryPersonName ? ` • ${deliveryPersonName}` : "") : ""}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="font-medium">{order.status.toUpperCase()}</div>
              </div>
            </div>
            {order.status === "cancelled" && order.cancelledReason ? (
              <div className="mt-2 text-xs text-muted-foreground">Reason: {order.cancelledReason}</div>
            ) : null}
            {order.paymentMethod === "delivery" && (order.deliveryCustomerName || order.deliveryCustomerAddress || order.deliveryCustomerPhone) && (
              <div className="mt-2 rounded-md border bg-muted/30 p-2 space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Delivery Info</div>
                {order.deliveryCustomerName && <div className="text-sm">Customer: {order.deliveryCustomerName}</div>}
                {order.deliveryCustomerAddress && <div className="text-sm">Address: {order.deliveryCustomerAddress}</div>}
                {order.deliveryCustomerPhone && <div className="text-sm">Phone: {order.deliveryCustomerPhone}</div>}
              </div>
            )}
          </div>

          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Qty</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Price</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.itemId} className="border-t">
                    <td className="px-3 py-2">
                      <div>{l.name}</div>
                      {l.expiryDate && (
                        <div className="text-[10px] text-muted-foreground">
                          Exp: {format(new Date(l.expiryDate), "dd/MM/yyyy")}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{l.qty}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatIntMoney(l.unitPrice)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatIntMoney(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Subtotal</div>
              <div className="text-sm font-semibold">{formatIntMoney(order.subtotal)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Discount</div>
              <div className="text-sm font-semibold">{formatIntMoney(order.discountTotal)}</div>
            </div>
            {(order.taxAmount ?? 0) > 0 && (
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Tax</div>
                <div className="text-sm font-semibold">{formatIntMoney(order.taxAmount)}</div>
              </div>
            )}
            {(order.serviceChargeAmount ?? 0) > 0 && (
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Service</div>
                <div className="text-sm font-semibold">{formatIntMoney(order.serviceChargeAmount)}</div>
              </div>
            )}
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-sm font-semibold">{formatIntMoney(order.total)}</div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onShare}>
            <Share2 className="h-4 w-4 mr-1" />
            Share PDF
          </Button>
          <Button variant="outline" onClick={() => void onPrint()}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
