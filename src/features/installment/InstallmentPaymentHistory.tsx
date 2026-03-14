import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import type { Settings } from "@/db/schema";
import { formatIntMoney, fmtDateTime } from "@/features/pos/format";
import { buildPaymentHistoryPdf } from "./installment-pdf";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";
import { SaveShareMenu } from "@/components/SaveShareMenu";

interface Props {
  customer: InstallmentCustomer;
  payments: InstallmentPayment[];
  settings: Settings | null;
  onClose: () => void;
}

export function InstallmentPaymentHistory({ customer, payments, settings, onClose }: Props) {
  const sorted = [...payments].sort((a, b) => b.createdAt - a.createdAt);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalLateFee = payments.reduce((s, p) => s + (p.lateFeeAmount ?? 0), 0);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment History — {customer.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded bg-muted/50 p-2">
            <div className="text-muted-foreground">Total Paid</div>
            <div className="font-bold text-green-600">{formatIntMoney(totalPaid)}</div>
          </div>
          <div className="rounded bg-muted/50 p-2">
            <div className="text-muted-foreground">Late Fees</div>
            <div className="font-bold">{formatIntMoney(totalLateFee)}</div>
          </div>
          <div className="rounded bg-muted/50 p-2">
            <div className="text-muted-foreground">Balance</div>
            <div className={`font-bold ${customer.totalBalance > 0 ? "text-destructive" : "text-green-600"}`}>
              {formatIntMoney(customer.totalBalance)}
            </div>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">No payments recorded yet.</div>
        ) : (
          <div className="space-y-2">
            {sorted.map(p => (
              <div key={p.id} className="rounded-md border p-2 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">#{p.receiptNo} — {fmtDateTime(p.createdAt)}</span>
                  <span className="font-bold text-green-600">{formatIntMoney(p.amount)}</span>
                </div>
                <div className="text-muted-foreground mt-0.5">
                  Month: {p.month} • Agent: {p.agentName}
                  {p.lateFeeAmount ? ` • Late Fee: ${formatIntMoney(p.lateFeeAmount)}` : ""}
                </div>
                <div className="text-muted-foreground">
                  Before: {formatIntMoney(p.balanceBefore)} → After: {formatIntMoney(p.balanceAfter)}
                </div>
                {p.note && <div className="text-muted-foreground italic mt-0.5">{p.note}</div>}
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <SaveShareMenu
            label="History PDF"
            getDefaultFileName={() => `payment_history_${customer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`}
            onSave={async (fn) => {
              const doc = buildPaymentHistoryPdf({ customer, payments: sorted, settings });
              const bytes = doc.output("arraybuffer");
              await savePdfBytes(new Uint8Array(bytes), fn ?? `payment_history_${customer.name.replace(/\s+/g, "_")}.pdf`);
            }}
            onShare={async () => {
              const doc = buildPaymentHistoryPdf({ customer, payments: sorted, settings });
              const bytes = doc.output("arraybuffer");
              await sharePdfBytes(new Uint8Array(bytes), `payment_history_${customer.name.replace(/\s+/g, "_")}.pdf`);
            }}
          />
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
