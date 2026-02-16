import React from "react";
import { Button } from "@/components/ui/button";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/appDb";
import type { Category, CreditCustomer, DeliveryPerson, MenuItem, Order, Settings, TableOrder, RestaurantTable, Waiter } from "@/db/schema";
import { ensureSeedData } from "@/db/seed";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { createOrder } from "@/features/pos/pos-db";
import { formatIntMoney, parseNonDecimalInt, fmtTime12 } from "@/features/pos/format";
import { useToast } from "@/hooks/use-toast";
import { ItemImageThumb } from "@/features/pos/ItemImageThumb";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { printReceiptFromOrder, printKotFromOrder } from "@/features/pos/receipt-print";
import { useWorkPeriod } from "@/features/pos/WorkPeriodProvider";
import { saveDeliveryCustomer } from "@/features/admin/delivery/delivery-customers";
import { Play, Square, Printer, Save, Truck, ClipboardList, UtensilsCrossed, X, Share2, ScanBarcode } from "lucide-react";
import { format } from "date-fns";
import { UpgradeDialog } from "@/features/licensing/UpgradeDialog";
import { Link } from "react-router-dom";

type CartLine = {
  itemId: string;
  name: string;
  unitPrice: number;
  qty: number;
};

// Helper to calculate tax/service charge amounts
function calculateCharges(
  subtotalAfterDiscount: number,
  settings: Settings | null
): { taxAmount: number; serviceChargeAmount: number; taxLabel: string; serviceLabel: string } {
  let taxAmount = 0;
  let serviceChargeAmount = 0;
  const taxLabel = settings?.taxLabel || "Tax";
  const serviceLabel = settings?.serviceChargeLabel || "Service";

  if (settings?.taxEnabled && settings.taxValue) {
    if (settings.taxType === "percent") {
      taxAmount = Math.round((subtotalAfterDiscount * settings.taxValue) / 100);
    } else {
      taxAmount = Math.round(settings.taxValue);
    }
  }

  if (settings?.serviceChargeEnabled && settings.serviceChargeValue) {
    if (settings.serviceChargeType === "percent") {
      serviceChargeAmount = Math.round((subtotalAfterDiscount * settings.serviceChargeValue) / 100);
    } else {
      serviceChargeAmount = Math.round(settings.serviceChargeValue);
    }
  }

  return { taxAmount, serviceChargeAmount, taxLabel, serviceLabel };
}

export default function PosDashboard() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { currentWorkPeriod, isWorkPeriodActive, startWorkPeriod, endWorkPeriod, refreshWorkPeriod } = useWorkPeriod();

  const [categories, setCategories] = React.useState<Category[]>([]);
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [inventory, setInventory] = React.useState<Record<string, number>>({});
  const [activeCategoryId, setActiveCategoryId] = React.useState<string | null>(null);
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [customers, setCustomers] = React.useState<CreditCustomer[]>([]);
  const [deliveryPersons, setDeliveryPersons] = React.useState<DeliveryPerson[]>([]);
  const [posSettings, setPosSettings] = React.useState<Settings | null>(null);

  const [itemQuery, setItemQuery] = React.useState("");

  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [receiptOrder, setReceiptOrder] = React.useState<Order | null>(null);

  // Upgrade dialog
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [upgradeMsg, setUpgradeMsg] = React.useState("");

  const [creditOpen, setCreditOpen] = React.useState(false);
  const [creditCustomerId, setCreditCustomerId] = React.useState<string>("");
  const [newCustomerName, setNewCustomerName] = React.useState("");
  const [newCustomerMobile, setNewCustomerMobile] = React.useState("");

  // Delivery dialog state
  const [deliveryOpen, setDeliveryOpen] = React.useState(false);
  const [deliveryPersonId, setDeliveryPersonId] = React.useState<string>("");
  const [deliveryCustomerName, setDeliveryCustomerName] = React.useState("");
  const [deliveryCustomerAddress, setDeliveryCustomerAddress] = React.useState("");
  const [deliveryCustomerPhone, setDeliveryCustomerPhone] = React.useState("");

  const [showItemImages, setShowItemImages] = React.useState<boolean>(true);
  const [endWorkDialogOpen, setEndWorkDialogOpen] = React.useState(false);

  // Pending table orders (for cashier/admin awareness)
  const [pendingTableOrders, setPendingTableOrders] = React.useState<TableOrder[]>([]);
  const [tableMap, setTableMap] = React.useState<Record<string, RestaurantTable>>({});
  const [waiterMap, setWaiterMap] = React.useState<Record<string, Waiter>>({});

  // Cancel pending table order dialog
  const [cancelTableOrderId, setCancelTableOrderId] = React.useState<string | null>(null);
  const [cancelTableReason, setCancelTableReason] = React.useState("");

  // Variant picker state
  const [variantPickerItem, setVariantPickerItem] = React.useState<MenuItem | null>(null);

  // Price edit state
  const [priceEditItemId, setPriceEditItemId] = React.useState<string | null>(null);
  const [priceEditValue, setPriceEditValue] = React.useState<number>(0);
  
  // Editable tax/service amounts
  const [editTaxAmount, setEditTaxAmount] = React.useState<number | null>(null);
  const [editServiceAmount, setEditServiceAmount] = React.useState<number | null>(null);

  // Barcode scanner for POS search
  const [posScanning, setPosScanning] = React.useState(false);
  const posScannerRef = React.useRef<HTMLDivElement>(null);
  const posQrRef = React.useRef<Html5Qrcode | null>(null);

  const stopPosScanner = React.useCallback(() => {
    if (posQrRef.current) {
      const qr = posQrRef.current;
      posQrRef.current = null;
      try {
        if (qr.isScanning) {
          qr.stop().then(() => { try { qr.clear(); } catch {} }).catch(() => {});
        } else {
          try { qr.clear(); } catch {}
        }
      } catch {}
    }
    setPosScanning(false);
  }, []);

  const startPosScanner = React.useCallback(() => {
    if (!posScannerRef.current) return;
    const scannerId = "pos-scanner-region";
    posScannerRef.current.id = scannerId;
    const qr = new Html5Qrcode(scannerId);
    posQrRef.current = qr;
    setPosScanning(true);
    qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 100 } },
      (decodedText) => {
        setItemQuery(decodedText);
        stopPosScanner();
      },
      () => {},
    ).catch(() => setPosScanning(false));
  }, [stopPosScanner]);

  // Guard against rapid double-clicks on save/print buttons
  const [saving, setSaving] = React.useState(false);
  const [pendingOrdersForClose, setPendingOrdersForClose] = React.useState<number>(0);
  const [pendingOrdersConfirmed, setPendingOrdersConfirmed] = React.useState(false);

  const loadPosSettings = React.useCallback(async () => {
    const s = await db.settings.get("app");
    setPosSettings(s ?? null);
    setShowItemImages(s?.posShowItemImages ?? true);
  }, []);

  const canCreateCustomers = session?.role === "admin";

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      await ensureSeedData();
      await loadPosSettings();
      const [cats, its, inv, custs, delPersons, openTableOrders, allTables, allWaiters] = await Promise.all([
        db.categories.orderBy("createdAt").toArray(),
        db.items.orderBy("createdAt").toArray(),
        db.inventory.toArray(),
        db.customers.orderBy("createdAt").toArray(),
        db.deliveryPersons.orderBy("createdAt").toArray(),
        db.tableOrders.where("status").equals("open").toArray(),
        db.restaurantTables.toArray(),
        db.waiters.toArray(),
      ]);
      if (ignore) return;
      setCategories(cats);
      setItems(its);
      setInventory(Object.fromEntries(inv.map((r) => [r.itemId, r.quantity])));
      setActiveCategoryId(null);
      setCustomers(custs);
      setDeliveryPersons(delPersons);
      setPendingTableOrders(openTableOrders);
      setTableMap(Object.fromEntries(allTables.map((t) => [t.id, t])));
      setWaiterMap(Object.fromEntries(allWaiters.map((w) => [w.id, w])));
      if (session?.username) {
        await refreshWorkPeriod(session.username);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [loadPosSettings, refreshWorkPeriod, session?.username]);

  React.useEffect(() => {
    const onFocus = () => void loadPosSettings();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loadPosSettings]);

  const refreshAfterMutation = React.useCallback(async () => {
    const [inv, custs, delPersons, openTableOrders] = await Promise.all([
      db.inventory.toArray(),
      db.customers.orderBy("createdAt").toArray(),
      db.deliveryPersons.orderBy("createdAt").toArray(),
      db.tableOrders.where("status").equals("open").toArray(),
    ]);
    setInventory(Object.fromEntries(inv.map((r) => [r.itemId, r.quantity])));
    setCustomers(custs);
    setDeliveryPersons(delPersons);
    setPendingTableOrders(openTableOrders);
  }, []);

  const cancelPendingTableOrder = async () => {
    if (!cancelTableOrderId || !cancelTableReason.trim()) {
      toast({ title: "Enter cancellation reason", variant: "destructive" });
      return;
    }
    try {
      const order = await db.tableOrders.get(cancelTableOrderId);
      if (!order) return;
      // Restock inventory
      const allItems = await db.items.toArray();
      const itemsById = Object.fromEntries(allItems.map((i) => [i.id, i]));
      for (const l of order.lines) {
        const item = itemsById[l.itemId];
        if (!item?.trackInventory) continue;
        const row = await db.inventory.get(l.itemId);
        const current = row?.quantity ?? 0;
        await db.inventory.put({ itemId: l.itemId, quantity: current + l.qty, updatedAt: Date.now() });
      }
      await db.tableOrders.update(cancelTableOrderId, {
        status: "cancelled",
        cancelledReason: cancelTableReason.trim(),
        workPeriodId: currentWorkPeriod?.id,
        updatedAt: Date.now(),
      });
      toast({ title: "Table order cancelled" });
      setCancelTableOrderId(null);
      setCancelTableReason("");
      await refreshAfterMutation();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const deliveryPersonsById = React.useMemo(() => Object.fromEntries(deliveryPersons.map((p) => [p.id, p])), [deliveryPersons]);

  // Filter items: if category selected, filter by category; then apply search
  const filteredByCategory = activeCategoryId ? items.filter((i) => i.categoryId === activeCategoryId) : items;
  const q = itemQuery.trim().toLowerCase();
  const skuSearchEnabled = posSettings?.skuSearchEnabled ?? false;
  // Search across ALL items (ignoring category filter when searching)
  const filtered = q 
    ? items.filter((i) => i.name.toLowerCase().includes(q) || (skuSearchEnabled && i.sku?.toLowerCase().includes(q))) 
    : filteredByCategory;

  const subtotal = cart.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const discountTotal = Math.min(discountAmount, subtotal);
  const subtotalAfterDiscount = subtotal - discountTotal;
  const { taxAmount: calcTaxAmount, serviceChargeAmount: calcServiceAmount, taxLabel, serviceLabel } = calculateCharges(subtotalAfterDiscount, posSettings);
  const taxAmount = editTaxAmount ?? calcTaxAmount;
  const serviceChargeAmount = editServiceAmount ?? calcServiceAmount;
  const total = subtotalAfterDiscount + taxAmount + serviceChargeAmount;

  const itemsById = React.useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const customersById = React.useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);

  const addToCart = (item: MenuItem, variantPrice?: number) => {
    if (!isWorkPeriodActive) {
      toast({
        title: "Start work period first",
        description: "You must start a work period before making sales.",
        variant: "destructive",
      });
      return;
    }

    // If item has variations and no variant selected, show picker
    if (item.variations && item.variations.length > 0 && variantPrice === undefined) {
      setVariantPickerItem(item);
      return;
    }

    const price = variantPrice ?? item.price;

    // Block oversell at add-time (inventory is best-effort; final enforcement is in transaction).
    if (item.trackInventory) {
      const available = inventory[item.id] ?? 0;
      const inCart = cart.find((l) => l.itemId === item.id && l.unitPrice === price)?.qty ?? 0;
      if (inCart + 1 > available) {
        toast({
          title: "Insufficient stock",
          description: `${item.name}: available ${available}`,
          variant: "destructive",
        });
        return;
      }
    }
    const cartKey = variantPrice !== undefined ? `${item.id}__v${variantPrice}` : item.id;
    const variantName = variantPrice !== undefined 
      ? `${item.name} (${item.variations?.find(v => v.price === variantPrice)?.name ?? formatIntMoney(variantPrice)})`
      : item.name;
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.itemId === cartKey);
      if (idx === -1) return [...prev, { itemId: cartKey, name: variantName, unitPrice: price, qty: 1 }];
      const next = [...prev];
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    });
  };

  const setQty = (itemId: string, qty: number) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.itemId !== itemId) return l;
        const item = itemsById[itemId];
        const nextQty = Math.max(1, qty);
        if (item?.trackInventory) {
          const available = inventory[itemId] ?? 0;
          return { ...l, qty: Math.min(nextQty, available) };
        }
        return { ...l, qty: nextQty };
      }),
    );
  };

  const removeLine = (itemId: string) => {
    setCart((prev) => prev.filter((l) => l.itemId !== itemId));
  };

  const resetSale = () => {
    setCart([]);
    setDiscountAmount(0);
    setEditTaxAmount(null);
    setEditServiceAmount(null);
  };

  // Save only (no print)
  const onSaveOnly = async () => {
    if (saving) return;
    if (!isWorkPeriodActive) {
      toast({ title: "Start work period first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const order = await createOrder({
        cashier: session?.username ?? "Unknown",
        paymentMethod: "cash",
        discountAmount,
        cart,
        itemsById,
        workPeriodId: currentWorkPeriod?.id,
        taxAmount,
        serviceChargeAmount,
      });
      toast({ title: "Sale saved", description: `Receipt ${order.receiptNo}` });
      setReceiptOrder(order);
      resetSale();
      await refreshAfterMutation();
    } catch (e: any) {
      handleSaleError(e, "Could not save sale");
    } finally {
      setSaving(false);
    }
  };

  // Save and print
  const onSaveAndPrint = async () => {
    if (saving) return;
    if (!isWorkPeriodActive) {
      toast({ title: "Start work period first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const order = await createOrder({
        cashier: session?.username ?? "Unknown",
        paymentMethod: "cash",
        discountAmount,
        cart,
        itemsById,
        workPeriodId: currentWorkPeriod?.id,
        taxAmount,
        serviceChargeAmount,
      });
      toast({ title: "Sale saved", description: `Receipt ${order.receiptNo}` });
      setReceiptOrder(order);

      // Print receipt
      try {
        await printReceiptFromOrder(order);
        toast({ title: "Receipt printed" });
      } catch (printErr: any) {
        toast({ 
          title: "Print failed", 
          description: printErr?.message ?? String(printErr), 
          variant: "destructive" 
        });
      }

      resetSale();
      await refreshAfterMutation();
    } catch (e: any) {
      handleSaleError(e, "Could not save sale");
    } finally {
      setSaving(false);
    }
  };

  // Save and print KOT (Kitchen Order Ticket - always centered format)
  const onSaveAndPrintKot = async () => {
    if (saving) return;
    if (!isWorkPeriodActive) {
      toast({ title: "Start work period first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const order = await createOrder({
        cashier: session?.username ?? "Unknown",
        paymentMethod: "cash",
        discountAmount,
        cart,
        itemsById,
        workPeriodId: currentWorkPeriod?.id,
        taxAmount,
        serviceChargeAmount,
      });
      toast({ title: "Sale saved", description: `Receipt ${order.receiptNo}` });
      setReceiptOrder(order);

      // Print KOT (kitchen order ticket)
      try {
        await printKotFromOrder(order);
        toast({ title: "KOT printed" });
      } catch (printErr: any) {
        toast({ 
          title: "KOT print failed", 
          description: printErr?.message ?? String(printErr), 
          variant: "destructive" 
        });
      }

      resetSale();
      await refreshAfterMutation();
    } catch (e: any) {
      handleSaleError(e, "Could not save sale");
    } finally {
      setSaving(false);
    }
  };

  const openCredit = async () => {
    if (!isWorkPeriodActive) {
      toast({ title: "Start work period first", variant: "destructive" });
      return;
    }
    setCreditCustomerId(customers[0]?.id ?? "");
    setNewCustomerName("");
    setNewCustomerMobile("");
    setCreditOpen(true);
  };

  const resolveCreditCustomer = async () => {
    let custId = creditCustomerId;
    let creditCustomerName: string | undefined = custId ? customersById[custId]?.name : undefined;
    if (!custId) {
      if (!canCreateCustomers) {
        throw new Error("Cashier cannot add new credit customers. Please select an existing customer.");
      }
      const name = newCustomerName.trim();
      if (!name) throw new Error("Customer name is required.");
      const now = Date.now();
      const newId = `cust_${Math.random().toString(16).slice(2)}_${now.toString(16)}`;
      await db.customers.put({ id: newId, name, mobile: newCustomerMobile.trim() || undefined, createdAt: now });
      custId = newId;
      creditCustomerName = name;
    }
    return { custId, creditCustomerName };
  };

  const onCreditSaveOnly = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { custId, creditCustomerName } = await resolveCreditCustomer();
      const order = await createOrder({
        cashier: session?.username ?? "Unknown",
        paymentMethod: "credit",
        creditCustomerId: custId,
        discountAmount,
        cart,
        itemsById,
        workPeriodId: currentWorkPeriod?.id,
        taxAmount,
        serviceChargeAmount,
      });
      toast({ title: "Credit sale saved", description: `Receipt ${order.receiptNo}` });
      setReceiptOrder(order);
      setCreditOpen(false);
      resetSale();
      await refreshAfterMutation();
    } catch (e: any) {
      handleSaleError(e, "Could not save credit sale");
    } finally {
      setSaving(false);
    }
  };

  const onCreditSaveAndPrint = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { custId, creditCustomerName } = await resolveCreditCustomer();
      const order = await createOrder({
        cashier: session?.username ?? "Unknown",
        paymentMethod: "credit",
        creditCustomerId: custId,
        discountAmount,
        cart,
        itemsById,
        workPeriodId: currentWorkPeriod?.id,
        taxAmount,
        serviceChargeAmount,
      });
      toast({ title: "Credit sale saved", description: `Receipt ${order.receiptNo}` });
      setReceiptOrder(order);
      setCreditOpen(false);

      try {
        await printReceiptFromOrder(order);
        toast({ title: "Receipt printed" });
      } catch (printErr: any) {
        toast({ title: "Print failed", description: printErr?.message ?? String(printErr), variant: "destructive" });
      }

      resetSale();
      await refreshAfterMutation();
    } catch (e: any) {
      handleSaleError(e, "Could not save credit sale");
    } finally {
      setSaving(false);
    }
  };

  /** Handle createOrder errors – show upgrade dialog if limit hit */
  const handleSaleError = (e: any, fallbackTitle: string) => {
    const msg = e?.message ?? String(e);
    if (msg.startsWith("__UPGRADE__")) {
      setUpgradeMsg(msg.replace("__UPGRADE__", ""));
      setUpgradeOpen(true);
    } else {
      toast({ title: fallbackTitle, description: msg, variant: "destructive" });
    }
  };

  // Delivery handlers
  const openDelivery = async () => {
    if (!isWorkPeriodActive) {
      toast({ title: "Start work period first", variant: "destructive" });
      return;
    }
    if (deliveryPersons.length === 0) {
      toast({ title: "No delivery persons", description: "Add delivery persons in Admin > Delivery", variant: "destructive" });
      return;
    }
    setDeliveryPersonId(deliveryPersons[0]?.id ?? "");
    setDeliveryCustomerName("");
    setDeliveryCustomerAddress("");
    setDeliveryCustomerPhone("");
    setDeliveryOpen(true);
  };

  const onDeliverySaveOnly = async () => {
    if (saving) return;
    if (!deliveryPersonId) {
      toast({ title: "Select delivery person", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (deliveryCustomerName.trim()) {
        await saveDeliveryCustomer({
          name: deliveryCustomerName.trim(),
          phone: deliveryCustomerPhone.trim() || undefined,
          address: deliveryCustomerAddress.trim() || undefined,
        });
      }

      const order = await createOrder({
        cashier: session?.username ?? "Unknown",
        paymentMethod: "delivery",
        deliveryPersonId,
        deliveryCustomerName: deliveryCustomerName.trim() || undefined,
        deliveryCustomerAddress: deliveryCustomerAddress.trim() || undefined,
        deliveryCustomerPhone: deliveryCustomerPhone.trim() || undefined,
        discountAmount,
        cart,
        itemsById,
        workPeriodId: currentWorkPeriod?.id,
        taxAmount,
        serviceChargeAmount,
      });
      toast({ title: "Delivery sale saved", description: `Receipt ${order.receiptNo}` });
      setReceiptOrder(order);
      setDeliveryOpen(false);
      resetSale();
      await refreshAfterMutation();
    } catch (e: any) {
      handleSaleError(e, "Could not save delivery sale");
    } finally {
      setSaving(false);
    }
  };


  const onDeliverySaveAndPrint = async () => {
    if (saving) return;
    if (!deliveryPersonId) {
      toast({ title: "Select delivery person", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (deliveryCustomerName.trim()) {
        await saveDeliveryCustomer({
          name: deliveryCustomerName.trim(),
          phone: deliveryCustomerPhone.trim() || undefined,
          address: deliveryCustomerAddress.trim() || undefined,
        });
      }

      const deliveryPersonName = deliveryPersonsById[deliveryPersonId]?.name;
      const order = await createOrder({
        cashier: session?.username ?? "Unknown",
        paymentMethod: "delivery",
        deliveryPersonId,
        deliveryCustomerName: deliveryCustomerName.trim() || undefined,
        deliveryCustomerAddress: deliveryCustomerAddress.trim() || undefined,
        deliveryCustomerPhone: deliveryCustomerPhone.trim() || undefined,
        discountAmount,
        cart,
        itemsById,
        workPeriodId: currentWorkPeriod?.id,
        taxAmount,
        serviceChargeAmount,
      });
      toast({ title: "Delivery sale saved", description: `Receipt ${order.receiptNo}` });
      setReceiptOrder(order);
      setDeliveryOpen(false);

      try {
        await printReceiptFromOrder(order);
        toast({ title: "Receipt printed" });
      } catch (printErr: any) {
        toast({ title: "Print failed", description: printErr?.message ?? String(printErr), variant: "destructive" });
      }

      resetSale();
      await refreshAfterMutation();
    } catch (e: any) {
      handleSaleError(e, "Could not save delivery sale");
    } finally {
      setSaving(false);
    }
  };

  const handleStartWorkPeriod = async () => {
    if (!session?.username) return;
    await startWorkPeriod(session.username);
    toast({ title: "Work period started" });
  };

  const handleEndWorkPeriod = async () => {
    // Check for pending table orders
    const openTableOrders = await db.tableOrders.where("status").equals("open").toArray();
    if (openTableOrders.length > 0) {
      // Check if setting requires showing warning
      const shouldWarn = posSettings?.cashierEndWorkPeriodPendingCheck !== false; // default true
      if (shouldWarn && !pendingOrdersConfirmed) {
        setPendingOrdersForClose(openTableOrders.length);
        return;
      }
    }
    await endWorkPeriod();
    setEndWorkDialogOpen(false);
    setPendingOrdersConfirmed(false);
    toast({ title: "Work period ended" });
  };


  const confirmEndWithPending = async () => {
    setPendingOrdersConfirmed(true);
    setPendingOrdersForClose(0);
    await endWorkPeriod();
    setEndWorkDialogOpen(false);
    setPendingOrdersConfirmed(false);
    toast({ title: "Work period ended" });
  };

  return (
    <div className="pb-20 overflow-x-hidden">
      {/* Work Period Banner */}
      <div className="mb-4">
        {isWorkPeriodActive ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-green-500/30 bg-green-50 dark:bg-green-950/20 p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                Work Period Active • Started {fmtTime12(new Date(currentWorkPeriod!.startedAt).toTimeString().slice(0,5))}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEndWorkDialogOpen(true)}>
              <Square className="h-3 w-3 mr-1" />
              End Work
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-500/30 bg-orange-50 dark:bg-orange-950/20 p-3">
            <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
              Start a work period to begin sales
            </span>
            <Button onClick={handleStartWorkPeriod} className="bg-green-600 hover:bg-green-700">
              <Play className="h-3 w-3 mr-1" />
              Start Work Period
            </Button>
          </div>
        )}
      </div>


      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4 overflow-hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">Sales Dashboard</h1>
              <p className="text-sm text-muted-foreground">Cashier: {session?.username}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  toast({ title: "Generating menu PDF…" });
                  const { generateMenuPdf } = await import("@/features/pos/menu-pdf");
                  await generateMenuPdf();
                  toast({ title: "Menu PDF ready" });
                } catch (e: any) {
                  toast({ title: "Failed", description: e?.message ?? String(e), variant: "destructive" });
                }
              }}
            >
              <Share2 className="h-4 w-4 mr-1" />
              Share Menu
            </Button>
          </div>

          {/* Search - searches ALL categories */}
          <div className="w-full space-y-2 min-w-0">
            <div className="flex gap-2 min-w-0">
              <Input
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder={skuSearchEnabled ? "Search by name or SKU…" : "Search all items…"}
                aria-label="Search items"
                className="min-w-0 flex-1"
              />
              {skuSearchEnabled && (
                <Button
                  variant={posScanning ? "destructive" : "outline"}
                  size="icon"
                  className="shrink-0"
                  onClick={() => (posScanning ? stopPosScanner() : startPosScanner())}
                  title="Scan barcode"
                >
                  <ScanBarcode className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div ref={posScannerRef} className={posScanning ? "rounded-md overflow-hidden max-w-full aspect-[5/2]" : "hidden"} />
          </div>

          {/* Categories */}
          <Card className="p-2">
            <Tabs value={activeCategoryId ?? "all"} onValueChange={(v) => setActiveCategoryId(v === "all" ? null : v)}>
              <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto">
                <TabsTrigger value="all" className="text-xs px-2 py-1">All</TabsTrigger>
                {categories.map((c) => (
                  <TabsTrigger key={c.id} value={c.id} className="text-xs px-2 py-1">
                    {c.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </Card>

          {/* Items Grid - 4 cols × 2 rows (8 visible), horizontal scroll for more */}
          <div className="w-full overflow-x-auto overflow-y-hidden pb-2 overscroll-x-contain touch-manipulation" style={{ WebkitOverflowScrolling: "touch" }}>
            <div
              className="grid grid-rows-2 grid-flow-col gap-2"
              style={{ gridAutoColumns: 'calc(25% - 0.375rem)' }}
            >
              {filtered.map((i) => {
                const qty = inventory[i.id] ?? 0;
                const low = i.trackInventory && qty <= 3;
                const expiryStr = i.expiryDate && posSettings?.showExpiryOnDashboard 
                  ? format(new Date(i.expiryDate), "dd/MM/yy") 
                  : null;
                const isExpired = i.expiryDate && i.expiryDate < Date.now();
                const hasVariants = i.variations && i.variations.length > 0;

                const itemCard = (
                  <div
                    className={cn(
                      "rounded-lg border bg-card p-2 text-left shadow-sm transition-colors hover:bg-accent cursor-pointer",
                      low && "border-destructive/50",
                      isExpired && posSettings?.showExpiryOnDashboard && "border-destructive",
                      !isWorkPeriodActive && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {showItemImages ? (
                      <div className="mb-1 aspect-square overflow-hidden rounded-md">
                        <ItemImageThumb imagePath={i.imagePath} alt={i.name} />
                      </div>
                    ) : null}
                    <div className="text-xs font-semibold leading-tight truncate">{i.name}</div>
                    {skuSearchEnabled && i.sku && (
                      <div className="text-[10px] text-muted-foreground truncate">SKU: {i.sku}</div>
                    )}
                    <div className="text-sm font-bold">{formatIntMoney(i.price)}</div>
                    {hasVariants && (
                      <div className="text-[10px] text-primary">+{i.variations!.length} variant{i.variations!.length > 1 ? "s" : ""}</div>
                    )}
                    {i.trackInventory && (
                      <div className={cn("text-[10px]", low ? "text-destructive" : "text-muted-foreground")}>
                        Stock: {qty}{i.stockUnit && i.stockUnit !== "pcs" ? ` ${i.stockUnit}` : ""}
                      </div>
                    )}
                    {expiryStr && (
                      <div className={cn("text-[10px]", isExpired ? "text-destructive font-medium" : "text-muted-foreground")}>
                        Exp: {expiryStr}
                      </div>
                    )}
                  </div>
                );

                if (hasVariants) {
                  return (
                    <DropdownMenu key={i.id}>
                      <DropdownMenuTrigger asChild disabled={!isWorkPeriodActive}>
                        {itemCard}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-48 bg-popover z-50" align="start">
                        <DropdownMenuLabel className="text-xs">{i.name}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={i.trackInventory && qty <= 0}
                          onClick={() => addToCart(i, i.price)}
                        >
                          <div className="flex w-full justify-between items-center">
                            <span>Default</span>
                            <div className="flex items-center gap-2">
                              {i.trackInventory && (
                                <span className={cn("text-[10px]", qty <= 0 ? "text-destructive" : "text-muted-foreground")}>
                                  ({qty})
                                </span>
                              )}
                              <span className="font-bold">{formatIntMoney(i.price)}</span>
                            </div>
                          </div>
                        </DropdownMenuItem>
                        {i.variations!.map((v, idx) => {
                          const vStock = v.stock ?? 0;
                          const vOut = i.trackInventory && vStock <= 0;
                          return (
                            <DropdownMenuItem
                              key={idx}
                              disabled={vOut}
                              onClick={() => addToCart(i, v.price)}
                            >
                              <div className="flex w-full justify-between items-center">
                                <span>{v.name}</span>
                                <div className="flex items-center gap-2">
                                  {i.trackInventory && (
                                    <span className={cn("text-[10px]", vOut ? "text-destructive" : "text-muted-foreground")}>
                                      ({vStock})
                                    </span>
                                  )}
                                  <span className="font-bold">{formatIntMoney(v.price)}</span>
                                </div>
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }

                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => addToCart(i)}
                    disabled={!isWorkPeriodActive}
                    className={cn(
                      "rounded-lg border bg-card p-2 text-left shadow-sm transition-colors hover:bg-accent",
                      low && "border-destructive/50",
                      isExpired && posSettings?.showExpiryOnDashboard && "border-destructive",
                      !isWorkPeriodActive && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {showItemImages ? (
                      <div className="mb-1 aspect-square overflow-hidden rounded-md">
                        <ItemImageThumb imagePath={i.imagePath} alt={i.name} />
                      </div>
                    ) : null}
                    <div className="text-xs font-semibold leading-tight truncate">{i.name}</div>
                    <div className="text-sm font-bold">{formatIntMoney(i.price)}</div>
                    {i.trackInventory && (
                      <div className={cn("text-[10px]", low ? "text-destructive" : "text-muted-foreground")}>
                        Stock: {qty}{i.stockUnit && i.stockUnit !== "pcs" ? ` ${i.stockUnit}` : ""}
                      </div>
                    )}
                    {expiryStr && (
                      <div className={cn("text-[10px]", isExpired ? "text-destructive font-medium" : "text-muted-foreground")}>
                        Exp: {expiryStr}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cart Section */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Cart</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-3">
              {cart.length === 0 ? (
                <div className="text-sm text-muted-foreground">No items in cart.</div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {cart.map((l) => (
                    <div key={l.itemId} className="flex items-center justify-between gap-2 rounded-md border p-1.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{l.name}</div>
                        <div className="text-muted-foreground">
                          {priceEditItemId === l.itemId ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Input
                                inputMode="numeric"
                                value={priceEditValue === 0 ? "" : String(priceEditValue)}
                                onChange={(e) => setPriceEditValue(parseNonDecimalInt(e.target.value))}
                                className="h-6 w-16 text-xs px-1"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    // Get base item price - extract real itemId from cartKey
                                    const realId = l.itemId.includes("__v") ? l.itemId.split("__v")[0] : l.itemId;
                                    const basePrice = itemsById[realId]?.price ?? l.unitPrice;
                                    if (priceEditValue >= basePrice) {
                                      setCart((prev) => prev.map((cl) => cl.itemId === l.itemId ? { ...cl, unitPrice: priceEditValue } : cl));
                                    } else {
                                      toast({ title: `Price cannot be less than ${formatIntMoney(basePrice)}`, variant: "destructive" });
                                    }
                                    setPriceEditItemId(null);
                                  }
                                  if (e.key === "Escape") setPriceEditItemId(null);
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-[10px]"
                                onClick={() => {
                                  const realId = l.itemId.includes("__v") ? l.itemId.split("__v")[0] : l.itemId;
                                  const basePrice = itemsById[realId]?.price ?? l.unitPrice;
                                  if (priceEditValue >= basePrice) {
                                    setCart((prev) => prev.map((cl) => cl.itemId === l.itemId ? { ...cl, unitPrice: priceEditValue } : cl));
                                  } else {
                                    toast({ title: `Price cannot be less than ${formatIntMoney(basePrice)}`, variant: "destructive" });
                                  }
                                  setPriceEditItemId(null);
                                }}
                              >
                                ✓
                              </Button>
                            </div>
                          ) : (
                            <span
                              className="cursor-pointer hover:underline"
                              onClick={() => {
                                setPriceEditItemId(l.itemId);
                                setPriceEditValue(l.unitPrice);
                              }}
                            >
                              {formatIntMoney(l.unitPrice)} ea
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setQty(l.itemId, l.qty - 1)}>
                          -
                        </Button>
                        <div className="w-5 text-center text-xs">{l.qty}</div>
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setQty(l.itemId, l.qty + 1)}>
                          +
                        </Button>
                        <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => removeLine(l.itemId)}>
                          ×
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatIntMoney(subtotal)}</span>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="discountAmount" className="text-xs">
                  Discount
                </Label>
                <Input
                  id="discountAmount"
                  inputMode="numeric"
                  value={discountAmount === 0 ? "" : String(discountAmount)}
                  placeholder="0"
                  onChange={(e) => setDiscountAmount(parseNonDecimalInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>

              {/* Tax display - editable */}
              {posSettings?.taxEnabled && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {taxLabel} {posSettings.taxType === "percent" ? `(${posSettings.taxValue}%)` : ""}
                  </span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={taxAmount}
                    onChange={(e) => setEditTaxAmount(parseNonDecimalInt(e.target.value))}
                    className="h-7 w-20 text-right text-sm"
                  />
                </div>
              )}

              {/* Service charge display - editable */}
              {posSettings?.serviceChargeEnabled && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {serviceLabel} {posSettings.serviceChargeType === "percent" ? `(${posSettings.serviceChargeValue}%)` : ""}
                  </span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={serviceChargeAmount}
                    onChange={(e) => setEditServiceAmount(parseNonDecimalInt(e.target.value))}
                    className="h-7 w-20 text-right text-sm"
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="text-base font-bold">{formatIntMoney(total)}</span>
              </div>

              <Button 
                variant="secondary" 
                disabled={cart.length === 0 || !isWorkPeriodActive} 
                onClick={openCredit}
                className="w-full"
              >
                Pay Credit Customer
              </Button>

              {posSettings?.deliveryEnabled && deliveryPersons.length > 0 && (
                <Button 
                  variant="secondary" 
                  disabled={cart.length === 0 || !isWorkPeriodActive} 
                  onClick={openDelivery}
                  className="w-full"
                >
                  <Truck className="h-4 w-4 mr-1" />
                  Delivery
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Fixed bottom action buttons - above nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-6xl flex gap-2">
          <Button 
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            disabled={cart.length === 0 || !isWorkPeriodActive || saving}
            onClick={onSaveAndPrint}
          >
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
          <Button 
            className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black"
            disabled={cart.length === 0 || !isWorkPeriodActive || saving}
            onClick={onSaveAndPrintKot}
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            KOT
          </Button>
          <Button 
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            disabled={cart.length === 0 || !isWorkPeriodActive || saving}
            onClick={onSaveOnly}
          >
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Credit payment dialog */}
      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credit Customer</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {customers.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="creditCustomer">Select existing customer</Label>
                <select
                  id="creditCustomer"
                  value={creditCustomerId}
                  onChange={(e) => setCreditCustomerId(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {canCreateCustomers ? <option value="">Add new customer…</option> : null}
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.mobile ? ` (${c.mobile})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                No credit customers yet.
                {canCreateCustomers
                  ? " Add the first customer below."
                  : " Please ask Admin to add customers before using Credit sales."}
              </div>
            )}

            {!creditCustomerId && canCreateCustomers ? (
              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="newCustomerName">Customer name</Label>
                  <Input id="newCustomerName" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newCustomerMobile">Mobile (optional)</Label>
                  <Input
                    id="newCustomerMobile"
                    inputMode="tel"
                    value={newCustomerMobile}
                    onChange={(e) => setNewCustomerMobile(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCreditOpen(false)}>
              Close
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => void onCreditSaveAndPrint()}
              disabled={cart.length === 0}
            >
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button 
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => void onCreditSaveOnly()}
              disabled={cart.length === 0}
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery payment dialog */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delivery Order</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Delivery person selection */}
            {deliveryPersons.length > 1 ? (
              <div className="space-y-2">
                <Label htmlFor="deliveryPerson">Select Delivery Person</Label>
                <select
                  id="deliveryPerson"
                  value={deliveryPersonId}
                  onChange={(e) => setDeliveryPersonId(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {deliveryPersons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.phone ? ` (${p.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : deliveryPersons.length === 1 ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                Delivery by: <strong>{deliveryPersons[0].name}</strong>
              </div>
            ) : null}

            {/* Customer info fields */}
            {posSettings?.deliveryShowCustomerName && (
              <div className="space-y-2">
                <Label htmlFor="deliveryCustomerName">Customer Name (optional)</Label>
                <Input
                  id="deliveryCustomerName"
                  value={deliveryCustomerName}
                  onChange={(e) => setDeliveryCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                />
              </div>
            )}

            {posSettings?.deliveryShowCustomerAddress && (
              <div className="space-y-2">
                <Label htmlFor="deliveryCustomerAddress">Address (optional)</Label>
                <Input
                  id="deliveryCustomerAddress"
                  value={deliveryCustomerAddress}
                  onChange={(e) => setDeliveryCustomerAddress(e.target.value)}
                  placeholder="Enter delivery address"
                />
              </div>
            )}

            {posSettings?.deliveryShowCustomerPhone && (
              <div className="space-y-2">
                <Label htmlFor="deliveryCustomerPhone">Phone (optional)</Label>
                <Input
                  id="deliveryCustomerPhone"
                  inputMode="tel"
                  value={deliveryCustomerPhone}
                  onChange={(e) => setDeliveryCustomerPhone(e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDeliveryOpen(false)}>
              Close
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => void onDeliverySaveAndPrint()}
              disabled={cart.length === 0}
            >
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button 
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => void onDeliverySaveOnly()}
              disabled={cart.length === 0}
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={endWorkDialogOpen} onOpenChange={setEndWorkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Work Period?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will close your current work period. You can start a new one anytime.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndWorkDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleEndWorkPeriod}>
              End Work Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending table orders warning dialog */}
      <Dialog open={pendingOrdersForClose > 0} onOpenChange={(open) => { if (!open) setPendingOrdersForClose(0); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⚠️ Pending Table Orders</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            There {pendingOrdersForClose === 1 ? "is" : "are"} <span className="font-semibold text-foreground">{pendingOrdersForClose}</span> open table order{pendingOrdersForClose !== 1 ? "s" : ""} that have not been checked out or cancelled.
          </p>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to end the work period? Open orders will remain for manual resolution.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingOrdersForClose(0)}>
              Go Back
            </Button>
            <Button variant="destructive" onClick={() => void confirmEndWithPending()}>
              End Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog for viewing after save */}
      {receiptOrder ? (
        <ReceiptDialog
          order={receiptOrder}
          customersById={customersById}
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
          hideTrigger
        />
      ) : null}

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} message={upgradeMsg} />

      {/* Cancel pending table order dialog */}
      <Dialog open={!!cancelTableOrderId} onOpenChange={(open) => { if (!open) setCancelTableOrderId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Table Order</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will cancel the order and restock inventory. Enter a reason:
          </p>
          <Input
            value={cancelTableReason}
            onChange={(e) => setCancelTableReason(e.target.value)}
            placeholder="Reason for cancellation"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTableOrderId(null)}>Back</Button>
            <Button variant="destructive" onClick={() => void cancelPendingTableOrder()} disabled={!cancelTableReason.trim()}>
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
