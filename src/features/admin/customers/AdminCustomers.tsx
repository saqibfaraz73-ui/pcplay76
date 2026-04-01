import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db/appDb";
import type { CreditCustomer, CreditPayment, Order, Settings } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";
import { formatIntMoney, parseNonDecimalInt } from "@/features/pos/format";
import { CreditLodgePreview } from "@/features/admin/reports/CreditLodgePreview";
import { buildCreditLodgePdf, buildCreditPaymentsPdf, buildCreditItemsPdf } from "@/features/admin/reports/credit-lodge-pdf";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { Share2, CreditCard, ShoppingBag } from "lucide-react";
import { Capacitor } from "@capacitor/core";

type Mode = { open: false } | { open: true; customer?: CreditCustomer };
type PaymentMode = { open: false } | { open: true; customerId: string };

function toDateInputValue(ts: number) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function parseDateInput(value: string): number {
  const [y, m, d] = value.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return Date.now();
  return new Date(y, m - 1, d).getTime();
}

export function AdminCustomers() {
  const { toast } = useToast();
  const [customers, setCustomers] = React.useState<CreditCustomer[]>([]);
  const [payments, setPayments] = React.useState<CreditPayment[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<Mode>({ open: false });
  const [name, setName] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [previousBalance, setPreviousBalance] = React.useState(0);

  // Payment dialog
  const [paymentMode, setPaymentMode] = React.useState<PaymentMode>({ open: false });
  const [paymentAmount, setPaymentAmount] = React.useState(0);
  const [paymentNote, setPaymentNote] = React.useState("");

  // Lodge view
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
  const now = Date.now();
  const [from, setFrom] = React.useState(toDateInputValue(startOfDay(now - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = React.useState(toDateInputValue(endOfDay(now)));

  const refresh = React.useCallback(async () => {
    const rows = await db.customers.orderBy("createdAt").toArray();
    const pays = await db.creditPayments.orderBy("createdAt").toArray();
    const ords = await db.orders.toArray();
    const s = await db.settings.get("app");
    setCustomers(rows);
    setPayments(pays);
    setOrders(ords);
    setSettings(s ?? null);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = customers.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.mobile ?? "").toLowerCase().includes(q);
  });

  // Calculate balances
  const getCustomerBalance = React.useCallback((customerId: string) => {
    const cust = customers.find(c => c.id === customerId);
    const prevBal = cust?.previousBalance ?? 0;
    const customerOrders = orders.filter(
      (o) => o.creditCustomerId === customerId && o.paymentMethod === "credit" && o.status === "completed"
    );
    const totalCredit = customerOrders.reduce((sum, o) => sum + o.total, 0) + prevBal;
    const customerPayments = payments.filter((p) => p.customerId === customerId);
    const totalPaid = customerPayments.reduce((sum, p) => sum + p.amount, 0);
    return { totalCredit, totalPaid, balance: totalCredit - totalPaid };
  }, [orders, payments, customers]);

  const openNew = () => {
    setName("");
    setMobile("");
    setWhatsapp("");
    setEmail("");
    setPreviousBalance(0);
    setMode({ open: true });
  };

  const openEdit = (c: CreditCustomer) => {
    setName(c.name);
    setMobile(c.mobile ?? "");
    setWhatsapp(c.whatsapp ?? "");
    setEmail(c.email ?? "");
    setMode({ open: true, customer: c });
  };

  const save = async () => {
    try {
      const n = name.trim();
      if (!n) throw new Error("Customer name is required.");
      const now = Date.now();
      const next: CreditCustomer = {
        id: mode.open && mode.customer ? mode.customer.id : makeId("cust"),
        name: n,
        mobile: mobile.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        email: email.trim() || undefined,
        createdAt: mode.open && mode.customer ? mode.customer.createdAt : now,
      };
      await db.customers.put(next);
      toast({ title: "Saved" });
      setMode({ open: false });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const remove = async (c: CreditCustomer) => {
    if (!confirm(`Delete "${c.name}" and all their payment records? This cannot be undone.`)) return;
    await db.transaction("rw", [db.customers, db.creditPayments], async () => {
      await db.creditPayments.where("customerId").equals(c.id).delete();
      await db.customers.delete(c.id);
    });
    toast({ title: "Deleted" });
    await refresh();
  };

  const openPaymentDialog = (customerId: string) => {
    setPaymentAmount(0);
    setPaymentNote("");
    setPaymentMode({ open: true, customerId });
  };

  const savePayment = async () => {
    if (!paymentMode.open) return;
    try {
      if (paymentAmount <= 0) throw new Error("Amount must be greater than 0");
      const payment: CreditPayment = {
        id: makeId("pay"),
        customerId: paymentMode.customerId,
        amount: paymentAmount,
        note: paymentNote.trim() || undefined,
        createdAt: Date.now(),
      };
      await db.creditPayments.put(payment);
      toast({ title: "Payment recorded" });
      setPaymentMode({ open: false });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not save payment", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // Lodge data for selected customer
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const lodgeOrders = React.useMemo(() => {
    if (!selectedCustomerId) return [];
    const fromTs = startOfDay(parseDateInput(from));
    const toTs = endOfDay(parseDateInput(to));
    return orders.filter(
      (o) =>
        o.creditCustomerId === selectedCustomerId &&
        o.paymentMethod === "credit" &&
        o.createdAt >= fromTs &&
        o.createdAt <= toTs
    );
  }, [selectedCustomerId, orders, from, to]);

  const selectedPayments = React.useMemo(() => {
    if (!selectedCustomerId) return [];
    const fromTs = startOfDay(parseDateInput(from));
    const toTs = endOfDay(parseDateInput(to));
    return payments.filter(
      (p) => p.customerId === selectedCustomerId && p.createdAt >= fromTs && p.createdAt <= toTs
    );
  }, [selectedCustomerId, payments, from, to]);

  return (
    <Tabs defaultValue="customers">
      <TabsList className="flex w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="customers">Customers</TabsTrigger>
        <TabsTrigger value="lodge">Credit Lodge</TabsTrigger>
      </TabsList>

      <TabsContent value="customers">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Credit Customers</CardTitle>
              <CardDescription>Add and manage credit customers (admin-only).</CardDescription>
            </div>
            <Button onClick={openNew}>New</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="custSearch">Search</Label>
              <Input id="custSearch" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or mobile" />
            </div>

            {filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground">No customers yet.</div>
            ) : (
              <div className="space-y-2">
                {filtered.map((c) => {
                  const { totalCredit, totalPaid, balance } = getCustomerBalance(c.id);
                  return (
                    <div key={c.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.mobile ? `Mobile: ${c.mobile}` : "Mobile: —"}</div>
                          {c.whatsapp && <div className="text-xs text-muted-foreground">WhatsApp: {c.whatsapp}</div>}
                          {c.email && <div className="text-xs text-muted-foreground">Email: {c.email}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                            Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => void remove(c)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-md bg-muted/50 p-2">
                          <div className="text-muted-foreground">Total Credit</div>
                          <div className="font-semibold">{formatIntMoney(totalCredit)}</div>
                        </div>
                        <div className="rounded-md bg-muted/50 p-2">
                          <div className="text-muted-foreground">Paid</div>
                          <div className="font-semibold text-green-600">{formatIntMoney(totalPaid)}</div>
                        </div>
                        <div className="rounded-md bg-muted/50 p-2">
                          <div className="text-muted-foreground">Balance</div>
                          <div className={`font-semibold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
                            {formatIntMoney(balance)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openPaymentDialog(c.id)}>
                          Record Payment
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setSelectedCustomerId(c.id)}>
                          View Lodge
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>

          <Dialog open={mode.open} onOpenChange={(v) => setMode(v ? { open: true, customer: mode.open ? mode.customer : undefined } : { open: false })}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{mode.open && mode.customer ? "Edit Customer" : "New Customer"}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="custName">Name</Label>
                  <Input id="custName" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custMobile">Mobile (optional)</Label>
                  <Input id="custMobile" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custWhatsapp">WhatsApp Number (optional)</Label>
                  <Input id="custWhatsapp" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="e.g., +923001234567" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custEmail">Email (optional)</Label>
                  <Input id="custEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g., customer@email.com" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setMode({ open: false })}>
                  Close
                </Button>
                <Button onClick={() => void save()}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Payment Dialog */}
          <Dialog open={paymentMode.open} onOpenChange={(v) => setPaymentMode(v ? paymentMode : { open: false })}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="paymentAmount">Amount</Label>
                  <Input 
                    id="paymentAmount" 
                    inputMode="numeric"
                    value={paymentAmount === 0 ? "" : String(paymentAmount)} 
                    onChange={(e) => setPaymentAmount(parseNonDecimalInt(e.target.value))} 
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentNote">Note (optional)</Label>
                  <Input id="paymentNote" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="e.g., Cash deposit" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPaymentMode({ open: false })}>
                  Cancel
                </Button>
                <Button onClick={() => void savePayment()}>Save Payment</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      </TabsContent>

      <TabsContent value="lodge">
        <Card>
          <CardHeader>
            <CardTitle>Credit Customer Lodge</CardTitle>
            <CardDescription>View credit history and payments for a customer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="lodgeCustomer">Customer</Label>
                <select
                  id="lodgeCustomer"
                  value={selectedCustomerId ?? ""}
                  onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Select…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.mobile ? ` (${c.mobile})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lodgeFrom">From</Label>
                <Input id="lodgeFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lodgeTo">To</Label>
                <Input id="lodgeTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>

            {selectedCustomer && (
              <>
                <div className="flex flex-wrap gap-2">
                  <SaveShareMenu
                    label="Full Lodge"
                    getDefaultFileName={() => `credit_lodge_${selectedCustomer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`}
                    onSave={async (fn) => {
                      try {
                        const doc = buildCreditLodgePdf({ restaurantName: settings?.restaurantName ?? "SANGI POS", fromLabel: from, toLabel: to, customer: selectedCustomer, orders: lodgeOrders, payments: selectedPayments });
                        const bytes = doc.output("arraybuffer");
                        const defaultName = `credit_lodge_${selectedCustomer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
                        await savePdfBytes(new Uint8Array(bytes), fn ?? defaultName);
                      } catch (e: any) { toast({ title: "Could not save PDF", description: e?.message ?? String(e), variant: "destructive" }); }
                    }}
                    onShare={async () => {
                      try {
                        const doc = buildCreditLodgePdf({ restaurantName: settings?.restaurantName ?? "SANGI POS", fromLabel: from, toLabel: to, customer: selectedCustomer, orders: lodgeOrders, payments: selectedPayments });
                        const bytes = doc.output("arraybuffer");
                        const fileName = `credit_lodge_${selectedCustomer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
                        await sharePdfBytes(new Uint8Array(bytes), fileName, `Credit Lodge - ${selectedCustomer.name}`);
                      } catch (e: any) { toast({ title: "Could not export PDF", description: e?.message ?? String(e), variant: "destructive" }); }
                    }}
                  />
                  <SaveShareMenu
                    label="Payments"
                    getDefaultFileName={() => `credit_payments_${selectedCustomer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`}
                    onSave={async (fn) => {
                      try {
                        const doc = buildCreditPaymentsPdf({ restaurantName: settings?.restaurantName ?? "SANGI POS", fromLabel: from, toLabel: to, customer: selectedCustomer, orders: lodgeOrders, payments: selectedPayments });
                        const bytes = doc.output("arraybuffer");
                        const defaultName = `credit_payments_${selectedCustomer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
                        await savePdfBytes(new Uint8Array(bytes), fn ?? defaultName);
                      } catch (e: any) { toast({ title: "Could not save PDF", description: e?.message ?? String(e), variant: "destructive" }); }
                    }}
                    onShare={async () => {
                      try {
                        const doc = buildCreditPaymentsPdf({ restaurantName: settings?.restaurantName ?? "SANGI POS", fromLabel: from, toLabel: to, customer: selectedCustomer, orders: lodgeOrders, payments: selectedPayments });
                        const bytes = doc.output("arraybuffer");
                        const fileName = `credit_payments_${selectedCustomer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
                        await sharePdfBytes(new Uint8Array(bytes), fileName, `Payments - ${selectedCustomer.name}`);
                      } catch (e: any) { toast({ title: "Could not export PDF", description: e?.message ?? String(e), variant: "destructive" }); }
                    }}
                  />
                  <SaveShareMenu
                    label="Items"
                    getDefaultFileName={() => `credit_items_${selectedCustomer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`}
                    onSave={async (fn) => {
                      try {
                        const doc = buildCreditItemsPdf({ restaurantName: settings?.restaurantName ?? "SANGI POS", fromLabel: from, toLabel: to, customer: selectedCustomer, orders: lodgeOrders, payments: selectedPayments });
                        const bytes = doc.output("arraybuffer");
                        const defaultName = `credit_items_${selectedCustomer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
                        await savePdfBytes(new Uint8Array(bytes), fn ?? defaultName);
                      } catch (e: any) { toast({ title: "Could not save PDF", description: e?.message ?? String(e), variant: "destructive" }); }
                    }}
                    onShare={async () => {
                      try {
                        const doc = buildCreditItemsPdf({ restaurantName: settings?.restaurantName ?? "SANGI POS", fromLabel: from, toLabel: to, customer: selectedCustomer, orders: lodgeOrders, payments: selectedPayments });
                        const bytes = doc.output("arraybuffer");
                        const fileName = `credit_items_${selectedCustomer.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
                        await sharePdfBytes(new Uint8Array(bytes), fileName, `Items - ${selectedCustomer.name}`);
                      } catch (e: any) { toast({ title: "Could not export PDF", description: e?.message ?? String(e), variant: "destructive" }); }
                    }}
                  />
                </div>
                <CreditLodgePreview
                  restaurantName={settings?.restaurantName ?? "SANGI POS"}
                  fromLabel={from}
                  toLabel={to}
                  customer={selectedCustomer}
                  orders={lodgeOrders}
                  payments={selectedPayments}
                />
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
