import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/db/appDb";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import type { Settings } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";
import { formatIntMoney, parseNonDecimalInt } from "@/features/pos/format";
import { buildInstallmentReceiptPdf } from "./installment-pdf";
import { buildInstallmentReceiptEscPos } from "./installment-escpos";
import { sendToDefaultPrinter } from "@/features/pos/printer-routing";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { Printer } from "lucide-react";

interface Props {
  customer: InstallmentCustomer;
  payments: InstallmentPayment[];
  settings: Settings | null;
  agentName: string;
  isAdmin?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

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

/** Count how many periods were missed (no payment recorded) */
function countMissedPeriods(customer: InstallmentCustomer, payments: InstallmentPayment[]): number {
  if (customer.totalBalance <= 0) return 0;
  const freq = customer.frequency || "monthly";
  const paidPeriods = new Set(payments.map(p => p.month));
  const now = new Date();
  let missed = 0;

  if (freq === "monthly") {
    // Check last 12 months
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      // Only count missed if customer existed then
      if (d.getTime() < customer.createdAt) break;
      if (!paidPeriods.has(period)) missed++;
    }
  } else if (freq === "weekly") {
    // Check last 8 weeks
    for (let i = 0; i < 8; i++) {
      const d = new Date(now.getTime() - i * 7 * 86400000);
      const start = new Date(d.getFullYear(), 0, 1);
      const weekNo = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
      const period = `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
      if (d.getTime() < customer.createdAt) break;
      if (!paidPeriods.has(period)) missed++;
    }
  } else if (freq === "yearly") {
    for (let i = 0; i < 5; i++) {
      const year = `${now.getFullYear() - i}`;
      if (new Date(Number(year), 0, 1).getTime() < customer.createdAt) break;
      if (!paidPeriods.has(year)) missed++;
    }
  }
  return missed;
}

export function InstallmentPaymentDialog({ customer, payments, settings, agentName, isAdmin, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [savedPayment, setSavedPayment] = React.useState<InstallmentPayment | null>(null);
  const [includeDues, setIncludeDues] = React.useState(true);

  // Frequency-based period check
  const currentPeriod = getCurrentPeriod(customer.frequency);
  const alreadyPaidThisPeriod = payments.some(p => p.month === currentPeriod);
  const frequencyLabel = customer.frequency === "weekly" ? "week" : customer.frequency === "yearly" ? "year" : "month";

  // Calculate missed periods / accumulated dues
  const missedPeriods = countMissedPeriods(customer, payments);
  const accumulatedDues = missedPeriods * customer.monthlyInstallment;

  // Calculate late fee
  const now = new Date();
  const lateDays = customer.dueDate && now.getDate() > customer.dueDate
    ? now.getDate() - customer.dueDate : 0;
  const lateFee = lateDays > 0 && customer.lateFeePerDay ? lateDays * customer.lateFeePerDay : 0;

  // Default amount: current installment + missed dues (if includeDues)
  const suggestedAmount = includeDues ? accumulatedDues : customer.monthlyInstallment;
  const [amount, setAmount] = React.useState(suggestedAmount);
  const [includeLateFee, setIncludeLateFee] = React.useState(true);

  // Update amount when includeDues changes
  React.useEffect(() => {
    setAmount(includeDues ? accumulatedDues : customer.monthlyInstallment);
  }, [includeDues, accumulatedDues, customer.monthlyInstallment]);

  const balanceBefore = customer.totalBalance;
  const balanceAfter = Math.max(0, balanceBefore - amount);
  const actualLateFee = includeLateFee ? lateFee : 0;

  // Admin can override period restriction
  const canPay = isAdmin || !alreadyPaidThisPeriod;

  const handleSave = async () => {
    if (amount <= 0) { toast({ title: "Amount must be > 0", variant: "destructive" }); return; }
    if (!canPay) { toast({ title: `Already paid for this ${frequencyLabel}`, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const counter = (await db.counters.get("installmentPayment" as any)) ?? { id: "installmentPayment" as any, next: 1 };
      const receiptNo = counter.next;
      await db.counters.put({ id: "installmentPayment" as any, next: receiptNo + 1 });

      const payment: InstallmentPayment = {
        id: makeId("ipay"),
        customerId: customer.id,
        receiptNo,
        amount,
        lateFeeAmount: actualLateFee > 0 ? actualLateFee : undefined,
        balanceBefore,
        balanceAfter,
        agentName,
        note: note.trim() || undefined,
        month: currentPeriod,
        createdAt: Date.now(),
      };
      await db.installmentPayments.put(payment);

      // Update customer balance
      const updated = { ...customer, totalBalance: balanceAfter };
      // Auto-clear if balance is 0
      if (balanceAfter <= 0) {
        updated.status = "cleared" as any;
        updated.clearedAt = Date.now();
      }
      await db.installmentCustomers.put(updated);

      setSavedPayment(payment);
      toast({ title: "Payment recorded" });
      await onSaved();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (savedPayment) {
    return (
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Recorded ✓</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div>Receipt #: <strong>{savedPayment.receiptNo}</strong></div>
            <div>Customer: <strong>{customer.name}</strong></div>
            <div>Amount: <strong>{formatIntMoney(savedPayment.amount)}</strong></div>
            {savedPayment.lateFeeAmount ? <div>Late Fee: <strong>{formatIntMoney(savedPayment.lateFeeAmount)}</strong></div> : null}
            <div>Balance Before: {formatIntMoney(savedPayment.balanceBefore)}</div>
            <div>Balance After: <strong>{formatIntMoney(savedPayment.balanceAfter)}</strong></div>
            {savedPayment.balanceAfter <= 0 && (
              <div className="text-green-600 font-semibold">✅ Account Cleared!</div>
            )}
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  if (!settings) { toast({ title: "No printer settings", variant: "destructive" }); return; }
                  const escPos = buildInstallmentReceiptEscPos({ customer, payment: savedPayment, settings });
                  await sendToDefaultPrinter(settings, escPos);
                  toast({ title: "Printed ✓" });
                } catch (e: any) {
                  toast({ title: "Print failed", description: e?.message, variant: "destructive" });
                }
              }}
            >
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <SaveShareMenu
              label="Receipt"
              getDefaultFileName={() => `installment_receipt_${savedPayment.receiptNo}_${Date.now()}.pdf`}
              onSave={async (fn) => {
                const doc = buildInstallmentReceiptPdf({ customer, payment: savedPayment, settings });
                const bytes = doc.output("arraybuffer");
                await savePdfBytes(new Uint8Array(bytes), fn ?? `installment_receipt_${savedPayment.receiptNo}.pdf`);
              }}
              onShare={async () => {
                const doc = buildInstallmentReceiptPdf({ customer, payment: savedPayment, settings });
                const bytes = doc.output("arraybuffer");
                await sharePdfBytes(new Uint8Array(bytes), `installment_receipt_${savedPayment.receiptNo}.pdf`);
              }}
            />
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment — {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-muted/50 p-2">
              <div className="text-muted-foreground">{customer.frequency === "weekly" ? "Weekly" : customer.frequency === "yearly" ? "Yearly" : "Monthly"} Installment</div>
              <div className="font-bold">{formatIntMoney(customer.monthlyInstallment)}</div>
            </div>
            <div className="rounded bg-muted/50 p-2">
              <div className="text-muted-foreground">Current Balance</div>
              <div className="font-bold text-destructive">{formatIntMoney(balanceBefore)}</div>
            </div>
          </div>

          {/* Accumulated dues info */}
          {missedPeriods > 1 && (
            <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-2 text-xs text-orange-700 dark:text-orange-400">
              📋 {missedPeriods} {frequencyLabel}s missed. Accumulated dues: <strong>{formatIntMoney(accumulatedDues)}</strong>
              <div className="flex items-center gap-2 mt-1">
                <Switch checked={includeDues} onCheckedChange={setIncludeDues} className="scale-75" />
                <span>Include all missed dues in payment</span>
              </div>
            </div>
          )}

          {lateFee > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              ⚠ Late Fee: {formatIntMoney(lateFee)} ({lateDays} days × {formatIntMoney(customer.lateFeePerDay ?? 0)}/day)
              <div className="flex items-center gap-2 mt-1">
                <Switch checked={includeLateFee} onCheckedChange={setIncludeLateFee} className="scale-75" />
                <span>Collect late fee with this payment</span>
              </div>
            </div>
          )}

          {alreadyPaidThisPeriod && !isAdmin && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-700 dark:text-yellow-400">
              ⚠ Already paid for this {frequencyLabel}. Only one payment allowed per {frequencyLabel}.
            </div>
          )}

          {alreadyPaidThisPeriod && isAdmin && (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-2 text-xs text-blue-700 dark:text-blue-400">
              ℹ Already paid this {frequencyLabel}. Admin override enabled.
            </div>
          )}

          <div className="space-y-1">
            <Label>Payment Amount</Label>
            <Input
              value={amount || ""}
              onChange={e => setAmount(parseNonDecimalInt(e.target.value))}
              inputMode="numeric"
              placeholder="0"
              disabled={!canPay}
            />
            {isAdmin && (
              <p className="text-[10px] text-muted-foreground">Admin: enter any amount including full remaining balance</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Cash payment" disabled={!canPay} />
          </div>

          <div className="rounded bg-muted/50 p-2 text-xs">
            <div>Total to collect: <strong>{formatIntMoney(amount + actualLateFee)}</strong> (Payment {formatIntMoney(amount)} + Late Fee {formatIntMoney(actualLateFee)})</div>
            <div>Balance after payment: <strong>{formatIntMoney(balanceAfter)}</strong></div>
            {balanceAfter <= 0 && <div className="text-green-600 font-semibold mt-1">✅ This will clear the account!</div>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || !canPay}>Save Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
