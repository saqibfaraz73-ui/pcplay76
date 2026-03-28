import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/appDb";
import type { Category, CreditCustomer, MenuItem, RestaurantTable, Settings, TableOrder, TableOrderLine, Waiter } from "@/db/schema";
import { canMakeSale, incrementSaleCount } from "@/features/licensing/licensing-db";
import { AdRewardDialog } from "@/features/licensing/AdRewardDialog";
import { ensureSeedData } from "@/db/seed";
import { useAuth } from "@/auth/AuthProvider";
import { useWorkPeriod } from "@/features/pos/WorkPeriodProvider";
import { cn } from "@/lib/utils";
import { formatIntMoney, parseNonDecimalInt } from "@/features/pos/format";
import { useToast } from "@/hooks/use-toast";
import { ItemImageThumb } from "@/features/pos/ItemImageThumb";
import { makeId } from "@/features/admin/id";
import { printTableKot } from "@/features/pos/tables/table-print";
import { printReceiptFromOrder } from "@/features/pos/receipt-print";
import { Printer, Save, CreditCard, Users, X, Plus, Minus, UtensilsCrossed, ClipboardList, Share2 } from "lucide-react";
import { generateMenuPdf } from "@/features/pos/menu-pdf";
import { format } from "date-fns";

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
): { taxAmount: number; serviceChargeAmount: number } {
  let taxAmount = 0;
  let serviceChargeAmount = 0;

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

  return { taxAmount, serviceChargeAmount };
}

export function PosTablesManager() {
  const { session } = useAuth();
  const { currentWorkPeriod, isWorkPeriodActive, refreshWorkPeriod } = useWorkPeriod();
  const { toast } = useToast();

  const [categories, setCategories] = React.useState<Category[]>([]);
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [inventory, setInventory] = React.useState<Record<string, number>>({});
  const [activeCategoryId, setActiveCategoryId] = React.useState<string | null>(null);
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [customers, setCustomers] = React.useState<CreditCustomer[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [tables, setTables] = React.useState<RestaurantTable[]>([]);
  const [waiters, setWaiters] = React.useState<Waiter[]>([]);
  const [tableOrders, setTableOrders] = React.useState<TableOrder[]>([]);

  const [itemQuery, setItemQuery] = React.useState("");
  const [showItemImages, setShowItemImages] = React.useState<boolean>(true);

  // Table selection
  const [selectedTableId, setSelectedTableId] = React.useState("");
  const [selectedWaiterId, setSelectedWaiterId] = React.useState("");

  // View mode — all roles start on items/order dashboard
  const [viewMode, setViewMode] = React.useState<"tables" | "order">("order");

  // Checkout dialog
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [creditCustomerId, setCreditCustomerId] = React.useState<string>("");
  const [newCustomerName, setNewCustomerName] = React.useState("");
  const [newCustomerMobile, setNewCustomerMobile] = React.useState("");
  const [cashReceived, setCashReceived] = React.useState<number>(0);
  const [newCustomerMobile, setNewCustomerMobile] = React.useState("");

  // Cancel dialog in checkout
  const [cancelCheckoutOpen, setCancelCheckoutOpen] = React.useState(false);
  const [cancelCheckoutReason, setCancelCheckoutReason] = React.useState("");

  // Cancel specific item dialog
  const [cancelItemIdx, setCancelItemIdx] = React.useState<number | null>(null);
  const [cancelItemReason, setCancelItemReason] = React.useState("");

  // Variant picker state
  const [variantPickerItem, setVariantPickerItem] = React.useState<MenuItem | null>(null);

  // Price edit state
  const [priceEditItemId, setPriceEditItemId] = React.useState<string | null>(null);
  const [priceEditValue, setPriceEditValue] = React.useState<number>(0);

  const [isSubKotOnly, setIsSubKotOnly] = React.useState(false);

  const canCreateCustomers = session?.role === "admin";

  const load = React.useCallback(async () => {
    await ensureSeedData();
    const s = await db.settings.get("app");
    setSettings(s ?? null);
    setShowItemImages(s?.posShowItemImages ?? true);

    // Check if sub device with KOT-only mode
    try {
      const { getSyncConfig } = await import("@/features/sync/sync-utils");
      const config = getSyncConfig();
      setIsSubKotOnly(config.role === "sub" && !!s?.subKotOnly);
    } catch {
      setIsSubKotOnly(false);
    }
    
    const [cats, its, inv, custs, tbls, wtrs, orders] = await Promise.all([
      db.categories.orderBy("createdAt").toArray(),
      db.items.orderBy("createdAt").toArray(),
      db.inventory.toArray(),
      db.customers.orderBy("createdAt").toArray(),
      db.restaurantTables.orderBy("createdAt").toArray(),
      db.waiters.orderBy("createdAt").toArray(),
      db.tableOrders.where("status").equals("open").toArray(),
    ]);
    
    // Filter out inactive categories and items
    const activeCats = cats.filter(c => c.isActive !== false);
    const activeCatIds = new Set(activeCats.map(c => c.id));
    const activeItems = its.filter(i => i.isActive !== false && activeCatIds.has(i.categoryId));
    setCategories(activeCats);
    setItems(activeItems);
    setInventory(Object.fromEntries(inv.map((r) => [r.itemId, r.quantity])));
    setActiveCategoryId(null);
    setCustomers(custs);
    setTables(tbls);
    setWaiters(wtrs);
    setTableOrders(orders);
  }, []);

  React.useEffect(() => { void load(); void refreshWorkPeriod(); }, [load, refreshWorkPeriod]);

  const refreshAfterMutation = React.useCallback(async () => {
    const [inv, custs, orders] = await Promise.all([
      db.inventory.toArray(),
      db.customers.orderBy("createdAt").toArray(),
      db.tableOrders.where("status").equals("open").toArray(),
    ]);
    setInventory(Object.fromEntries(inv.map((r) => [r.itemId, r.quantity])));
    setCustomers(custs);
    setTableOrders(orders);
  }, []);

  const isWaiter = session?.role === "waiter";
  const isSupervisor = session?.role === "supervisor";
  const itemsById = React.useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const tablesById = React.useMemo(() => Object.fromEntries(tables.map((t) => [t.id, t])), [tables]);
  const waitersById = React.useMemo(() => Object.fromEntries(waiters.map((w) => [w.id, w])), [waiters]);

  // Find the logged-in waiter record (match by name)
  const loggedInWaiter = React.useMemo(() => {
    if ((!isWaiter && !isSupervisor) || !session?.username) return null;
    return waiters.find((w) => w.name.toLowerCase() === session.username.toLowerCase()) ?? null;
  }, [isWaiter, isSupervisor, session?.username, waiters]);

  // Filter tables: if waiter is restricted, only show their assigned tables
  const visibleTables = React.useMemo(() => {
    // Supervisor sees all tables (no restriction)
    if (isSupervisor) return tables;
    if (!isWaiter || !settings?.waiterRestrictToOwnTables || !loggedInWaiter) return tables;
    const assigned = loggedInWaiter.assignedTableIds;
    if (!assigned || assigned.length === 0) return tables; // no restriction if no tables assigned
    return tables.filter((t) => assigned.includes(t.id));
  }, [tables, isWaiter, isSupervisor, settings?.waiterRestrictToOwnTables, loggedInWaiter]);

  // Auto-select waiter when logged in as waiter (not supervisor - they can pick any)
  React.useEffect(() => {
    if (isWaiter && !isSupervisor && loggedInWaiter && !selectedWaiterId) {
      setSelectedWaiterId(loggedInWaiter.id);
    }
  }, [isWaiter, isSupervisor, loggedInWaiter, selectedWaiterId]);

  // Auto-select default table when waiter changes and table selection is disabled
  React.useEffect(() => {
    if (settings?.tableSelectionDisabled && selectedWaiterId) {
      const waiter = waitersById[selectedWaiterId];
      if (waiter?.defaultTableId && !selectedTableId) {
        setSelectedTableId(waiter.defaultTableId);
      }
    }
  }, [selectedWaiterId, settings?.tableSelectionDisabled, waitersById, selectedTableId]);

  const getTableOrder = (tableId: string) => tableOrders.find((o) => o.tableId === tableId);

  // Get effective table ID - use waiter's default table when table selection disabled
  const getEffectiveTableId = React.useCallback(() => {
    if (selectedTableId) return selectedTableId;
    if (settings?.tableSelectionDisabled && selectedWaiterId) {
      const waiter = waitersById[selectedWaiterId];
      if (waiter?.defaultTableId) return waiter.defaultTableId;
      // If no default table, use or create a virtual table ID based on waiter
      return `waiter_${selectedWaiterId}`;
    }
    return "";
  }, [selectedTableId, settings?.tableSelectionDisabled, selectedWaiterId, waitersById]);

  const filteredItems = React.useMemo(() => {
    let list = items;
    if (activeCategoryId !== null) {
      list = list.filter((i) => i.categoryId === activeCategoryId);
    }
    if (itemQuery.trim()) {
      const q = itemQuery.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, activeCategoryId, itemQuery]);

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
  const { taxAmount, serviceChargeAmount } = calculateCharges(subtotalAfterDiscount, settings);
  const grandTotal = subtotalAfterDiscount + taxAmount + serviceChargeAmount;

  const effectiveTableId = getEffectiveTableId();
  const currentTableOrder = effectiveTableId ? tableOrders.find((o) => o.tableId === effectiveTableId) : null;

  const addToCart = (item: MenuItem, variantPrice?: number) => {
    // If item has variations and no variant selected, show picker
    if (item.variations && item.variations.length > 0 && variantPrice === undefined) {
      setVariantPickerItem(item);
      return;
    }

    const price = variantPrice ?? item.price;

    // Block if out of stock
    if (item.trackInventory) {
      const available = inventory[item.id] ?? 0;
      const alreadyInCart = cart.find((l) => l.itemId === item.id)?.qty ?? 0;
      // Also account for items already on existing table order
      const onTable = currentTableOrder?.lines.find((l) => l.itemId === item.id)?.qty ?? 0;
      if (alreadyInCart + onTable + 1 > available) {
        toast({ title: `Out of stock: ${item.name} (available: ${available - onTable})`, variant: "destructive" });
        return;
      }
    }
    const cartKey = variantPrice !== undefined ? `${item.id}__v${variantPrice}` : item.id;
    const variantName = variantPrice !== undefined
      ? `${item.name} (${item.variations?.find(v => v.price === variantPrice)?.name ?? formatIntMoney(variantPrice)})`
      : item.name;
    setCart((prev) => {
      const existing = prev.find((l) => l.itemId === cartKey);
      if (existing) {
        return prev.map((l) => l.itemId === cartKey ? { ...l, qty: l.qty + 1 } : l);
      }
      return [...prev, { itemId: cartKey, name: variantName, unitPrice: price, qty: 1 }];
    });
  };

  const updateQty = (itemId: string, delta: number) => {
    if (delta > 0) {
      const item = itemsById[itemId];
      if (item?.trackInventory) {
        const available = inventory[itemId] ?? 0;
        const inCart = cart.find((l) => l.itemId === itemId)?.qty ?? 0;
        const onTable = currentTableOrder?.lines.find((l) => l.itemId === itemId)?.qty ?? 0;
        if (inCart + onTable + 1 > available) {
          toast({ title: `Out of stock: ${item.name}`, variant: "destructive" });
          return;
        }
      }
    }
    setCart((prev) => prev.map((l) =>
      l.itemId === itemId ? { ...l, qty: Math.max(0, l.qty + delta) } : l
    ).filter((l) => l.qty > 0));
  };

  const clearCart = () => { setCart([]); setDiscountAmount(0); };

  const openTable = (tableId: string) => {
    setSelectedTableId(tableId);
    setViewMode("order");
    clearCart();
  };

  // Save order (KOT or just save without printing)
  const saveOrder = async (printKot: boolean) => {
    const tableId = getEffectiveTableId();
    if (!tableId) {
      toast({ title: "Select a waiter with a default table or select a table", variant: "destructive" });
      return;
    }
    if (!selectedWaiterId) {
      toast({ title: "Select a waiter", variant: "destructive" });
      return;
    }
    if (cart.length === 0) {
      toast({ title: "Cart is empty", variant: "destructive" });
      return;
    }

    const now = Date.now();
    const existingOrder = tableOrders.find((o) => o.tableId === tableId);

    // Helper to get real item ID from cart key (strips variant suffix)
    const getRealItemId = (cartKey: string) => cartKey.includes("__v") ? cartKey.split("__v")[0] : cartKey.includes("__ao_") ? cartKey.split("__ao_")[0] : cartKey;

    const lines: TableOrderLine[] = cart.map((l) => ({
      itemId: l.itemId,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      subtotal: l.unitPrice * l.qty,
    }));

    try {
      // Validate inventory before saving
      for (const l of cart) {
        const realId = getRealItemId(l.itemId);
        const item = itemsById[realId];
        if (!item?.trackInventory) continue;
        const row = await db.inventory.get(realId);
        const available = row?.quantity ?? 0;
        if (l.qty > available) {
          throw new Error(`Insufficient stock for ${l.name}. Available: ${available}`);
        }
      }

      // Deduct inventory for new cart items
      for (const l of cart) {
        const realId = getRealItemId(l.itemId);
        const item = itemsById[realId];
        if (!item?.trackInventory) continue;
        const row = await db.inventory.get(realId);
        const current = row?.quantity ?? 0;
        await db.inventory.put({ itemId: realId, quantity: current - l.qty, updatedAt: now });
      }

      if (existingOrder) {
        const mergedLines = [...existingOrder.lines];
        for (const newLine of lines) {
          const existingLine = mergedLines.find((l) => l.itemId === newLine.itemId);
          if (existingLine) {
            existingLine.qty += newLine.qty;
            existingLine.subtotal = existingLine.unitPrice * existingLine.qty;
          } else {
            mergedLines.push(newLine);
          }
        }
        const newSubtotal = mergedLines.reduce((s, l) => s + l.subtotal, 0);
        const { taxAmount: newTax, serviceChargeAmount: newService } = calculateCharges(newSubtotal, settings);
        
        await db.tableOrders.update(existingOrder.id, {
          lines: mergedLines,
          subtotal: newSubtotal,
          taxAmount: newTax,
          serviceChargeAmount: newService,
          total: newSubtotal + newTax + newService,
          waiterId: selectedWaiterId,
          waiterName: waitersById[selectedWaiterId]?.name,
          tableNumber: tablesById[tableId]?.tableNumber,
          updatedAt: now,
        });
      } else {
        const newSubtotal = lines.reduce((s, l) => s + l.subtotal, 0);
        const { taxAmount: newTax, serviceChargeAmount: newService } = calculateCharges(newSubtotal, settings);
        
        const order: TableOrder = {
          id: makeId("tord"),
          tableId,
          waiterId: selectedWaiterId,
          waiterName: waitersById[selectedWaiterId]?.name,
          tableNumber: tablesById[tableId]?.tableNumber,
          status: "open",
          lines,
          subtotal: newSubtotal,
          discountTotal: 0,
          taxAmount: newTax,
          serviceChargeAmount: newService,
          total: newSubtotal + newTax + newService,
          createdAt: now,
          updatedAt: now,
        };
        await db.tableOrders.put(order);
      }

      // Create kitchen order if KDS enabled
      try {
        if (settings?.kitchenDisplayEnabled) {
          const table = tablesById[tableId];
          const waiter = waitersById[selectedWaiterId];
          const { createKitchenOrderFromOrder } = await import("@/features/kitchen/kitchen-handler");
          const tableOrder = await db.tableOrders.where("tableId").equals(tableId).and(o => o.status === "open").first();
          if (tableOrder) {
            await createKitchenOrderFromOrder(
              tableOrder.id,
              tableOrder.receiptNo ?? 0,
              cart.map(l => ({ name: l.name, qty: l.qty })),
              "table",
              { tableNumber: table?.tableNumber, waiterName: waiter?.name }
            );
          }
        }
      } catch (e) {
        console.warn("[Kitchen] Failed to create kitchen order:", e);
      }

      if (printKot) {
        try {
          const table = tablesById[tableId];
          const waiter = waitersById[selectedWaiterId];
          await printTableKot({
            tableNumber: table?.tableNumber ?? (settings?.tableSelectionDisabled ? waiter?.name ?? "?" : "?"),
            waiterName: waiter?.name ?? "Unknown",
            items: cart,
            settings,
          });
          toast({ title: "KOT sent to kitchen" });
        } catch (e: any) {
          toast({ title: "KOT print failed, but order saved", description: e?.message ?? String(e), variant: "destructive" });
        }
      } else {
        toast({ title: "Order saved" });
      }

      clearCart();
      await refreshAfterMutation();

      // Sync table order + kitchen order to Main device if in Sub mode (fire-and-forget)
      try {
        const { getSyncConfig } = await import("@/features/sync/sync-utils");
        const config = getSyncConfig();
        if (config.role === "sub") {
          const updatedOrder = await db.tableOrders.where("tableId").equals(tableId).and(o => o.status === "open").first();
          if (updatedOrder) {
            const { sendToMainApp } = await import("@/features/sync/sync-client");
            const { getLicense } = await import("@/features/licensing/licensing-db");
            const lic = await getLicense();
            const waiter = waitersById[updatedOrder.waiterId];
            const table = tablesById[updatedOrder.tableId];
            sendToMainApp("table-order", { ...updatedOrder, _waiterName: waiter?.name, _tableNumber: table?.tableNumber }, lic.deviceId).catch((e) =>
              console.warn("[Sync] Failed to sync table order:", e)
            );

            // Also send kitchen order to Main if KDS enabled
            if (settings?.kitchenDisplayEnabled) {
              const kitchenOrder = {
                id: `ko_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`,
                sourceOrderId: updatedOrder.id,
                sourceType: "table" as const,
                orderNumber: updatedOrder.receiptNo ?? 0,
                tableNumber: table?.tableNumber,
                waiterName: waiter?.name,
                items: cart.map(l => ({ name: l.name, qty: l.qty })),
                status: "pending" as const,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              sendToMainApp("kitchen-order", kitchenOrder, lic.deviceId).catch(() => {});
            }
          }
        }
      } catch {
        // Sync module not available — ignore
      }
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const backToTables = () => {
    setViewMode("tables");
    setSelectedTableId("");
    clearCart();
  };

  const openCheckout = () => {
    if (!currentTableOrder) {
      toast({ title: "No items on this table", variant: "destructive" });
      return;
    }
    setCheckoutOpen(true);
  };

  // Editable tax/service for checkout
  const [editTaxAmount, setEditTaxAmount] = React.useState<number | null>(null);
  const [editServiceAmount, setEditServiceAmount] = React.useState<number | null>(null);

  // Ad reward dialog
  const [adOpen, setAdOpen] = React.useState(false);
  const [adMsg, setAdMsg] = React.useState("");
  const [adNeedsOnlineCheck, setAdNeedsOnlineCheck] = React.useState(false);

  const completeCheckout = async (paymentMethod: "cash" | "credit", shouldPrint: boolean) => {
    if (!currentTableOrder) return;

    // If sub app with KOT-only mode, force no receipt printing
    let actualShouldPrint = shouldPrint;
    try {
      const { getSyncConfig } = await import("@/features/sync/sync-utils");
      const config = getSyncConfig();
      if (config.role === "sub" && settings?.subKotOnly) {
        actualShouldPrint = false;
      }
    } catch {}

    
    if (paymentMethod === "credit" && !creditCustomerId && !newCustomerName.trim()) {
      toast({ title: "Select or enter customer name", variant: "destructive" });
      return;
    }

    // License limit check
    const limitCheck = await canMakeSale("table");
    if (!limitCheck.allowed) {
      setAdMsg(limitCheck.message);
      setAdNeedsOnlineCheck(!!limitCheck.needsOnlineVerification);
      setAdOpen(true);
      return;
    }

    const now = Date.now();

    try {
      let custId = creditCustomerId;
      if (paymentMethod === "credit" && !custId && newCustomerName.trim()) {
        const newCust = {
          id: makeId("cust"),
          name: newCustomerName.trim(),
          mobile: newCustomerMobile.trim() || undefined,
          createdAt: now,
        };
        await db.customers.put(newCust);
        custId = newCust.id;
      }

      const counter = (await db.counters.get("receipt")) ?? { id: "receipt" as const, next: 1 };
      const receiptNo = counter.next;
      await db.counters.put({ id: "receipt", next: receiptNo + 1 });

      const finalDiscount = Math.min(discountAmount, currentTableOrder.subtotal);
      const finalSubtotal = currentTableOrder.subtotal - finalDiscount;
      const { taxAmount: calcTax, serviceChargeAmount: calcService } = calculateCharges(finalSubtotal, settings);
      const finalTax = editTaxAmount ?? calcTax;
      const finalService = editServiceAmount ?? calcService;
      const finalTotal = finalSubtotal + finalTax + finalService;

      await db.tableOrders.update(currentTableOrder.id, {
        status: "completed",
        paymentMethod,
        creditCustomerId: paymentMethod === "credit" ? custId : undefined,
        cashier: session?.username ?? "Unknown",
        receiptNo,
        discountTotal: finalDiscount,
        taxAmount: finalTax,
        serviceChargeAmount: finalService,
        total: finalTotal,
        workPeriodId: currentWorkPeriod?.id,
        completedAt: now,
        updatedAt: now,
      });

      // Inventory already deducted when items were added to table (saveOrder)
      await incrementSaleCount("table");

      if (actualShouldPrint) {
        try {
          const receiptOrder = {
            id: currentTableOrder.id,
            receiptNo,
            cashier: session?.username ?? "Unknown",
            paymentMethod: paymentMethod as any,
            creditCustomerId: paymentMethod === "credit" ? custId : undefined,
            lines: currentTableOrder.lines.map((l) => ({
              itemId: l.itemId,
              name: l.name,
              qty: l.qty,
              unitPrice: l.unitPrice,
              subtotal: l.subtotal,
            })),
            subtotal: currentTableOrder.subtotal,
            discountTotal: finalDiscount,
            taxAmount: finalTax,
            serviceChargeAmount: finalService,
            total: finalTotal,
            status: "completed" as const,
            createdAt: currentTableOrder.createdAt,
            workPeriodId: currentWorkPeriod?.id,
          };
          const custName = paymentMethod === "credit" && custId
            ? customers.find((c) => c.id === custId)?.name
            : undefined;
          await printReceiptFromOrder(receiptOrder as any, { creditCustomerName: custName, section: "tables" });
          toast({ title: "Receipt printed" });
        } catch (printErr: any) {
          toast({ title: "Print failed", description: printErr?.message ?? String(printErr), variant: "destructive" });
        }
      }

      toast({ title: "Table checked out", description: `Receipt #${receiptNo}` });

      // Sync completed table order to Main device if in Sub mode
      try {
        const { getSyncConfig } = await import("@/features/sync/sync-utils");
        const config = getSyncConfig();
        if (config.role === "sub") {
          const completedOrder = await db.tableOrders.get(currentTableOrder.id);
          if (completedOrder) {
            const { sendToMainApp } = await import("@/features/sync/sync-client");
            const { getLicense } = await import("@/features/licensing/licensing-db");
            const lic = await getLicense();
            const waiter = waitersById[completedOrder.waiterId];
            const table = tablesById[completedOrder.tableId];
            sendToMainApp("table-order", { ...completedOrder, _waiterName: waiter?.name, _tableNumber: table?.tableNumber }, lic.deviceId).catch((e) =>
              console.warn("[Sync] Failed to sync completed table order:", e)
            );
          }
        }
      } catch {
        // Sync module not available — ignore
      }

      setCheckoutOpen(false);
      setCreditCustomerId("");
      setNewCustomerName("");
      setNewCustomerMobile("");
      setCashReceived(0);
      setDiscountAmount(0);
      setEditTaxAmount(null);
      setEditServiceAmount(null);
      backToTables();
      await refreshAfterMutation();
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // Cancel from checkout dialog
  const handleCancelFromCheckout = async () => {
    if (!currentTableOrder) return;
    if (!cancelCheckoutReason.trim()) {
      toast({ title: "Enter cancellation reason", variant: "destructive" });
      return;
    }

    try {
      const counter = (await db.counters.get("receipt")) ?? { id: "receipt" as const, next: 1 };
      const receiptNo = counter.next;
      await db.counters.put({ id: "receipt", next: receiptNo + 1 });

      // Restock inventory for cancelled order
      for (const l of currentTableOrder.lines) {
        const item = itemsById[l.itemId];
        if (!item?.trackInventory) continue;
        const row = await db.inventory.get(l.itemId);
        const current = row?.quantity ?? 0;
        await db.inventory.put({ itemId: l.itemId, quantity: current + l.qty, updatedAt: Date.now() });
      }

      await db.tableOrders.update(currentTableOrder.id, {
        status: "cancelled",
        cancelledReason: cancelCheckoutReason.trim(),
        cashier: session?.username ?? "Unknown",
        receiptNo,
        workPeriodId: currentWorkPeriod?.id,
        updatedAt: Date.now(),
      });
      toast({ title: "Order cancelled" });

      // Sync cancelled table order to Main device if in Sub mode
      try {
        const { getSyncConfig } = await import("@/features/sync/sync-utils");
        const config = getSyncConfig();
        if (config.role === "sub") {
          const cancelledOrder = await db.tableOrders.get(currentTableOrder.id);
          if (cancelledOrder) {
            const { sendToMainApp } = await import("@/features/sync/sync-client");
            const { getLicense } = await import("@/features/licensing/licensing-db");
            const lic = await getLicense();
            const waiter = waitersById[cancelledOrder.waiterId];
            const table = tablesById[cancelledOrder.tableId];
            sendToMainApp("table-order", { ...cancelledOrder, _waiterName: waiter?.name, _tableNumber: table?.tableNumber }, lic.deviceId).catch((e) =>
              console.warn("[Sync] Failed to sync cancelled table order:", e)
            );
          }
        }
      } catch {
        // Sync module not available
      }

      setCancelCheckoutOpen(false);
      setCancelCheckoutReason("");
      setCheckoutOpen(false);
      backToTables();
      await refreshAfterMutation();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // Cancel a specific item from the existing table order
  const cancelSpecificItem = async () => {
    if (cancelItemIdx === null || !currentTableOrder) return;
    if (!cancelItemReason.trim()) {
      toast({ title: "Enter cancellation reason", variant: "destructive" });
      return;
    }

    try {
      const line = currentTableOrder.lines[cancelItemIdx];
      if (!line) return;

      // Restock inventory for cancelled item
      const realId = line.itemId.includes("__v") ? line.itemId.split("__v")[0] : line.itemId;
      const item = itemsById[realId];
      if (item?.trackInventory) {
        const row = await db.inventory.get(realId);
        const current = row?.quantity ?? 0;
        await db.inventory.put({ itemId: realId, quantity: current + line.qty, updatedAt: Date.now() });
      }

      const newLines = currentTableOrder.lines.filter((_, i) => i !== cancelItemIdx);

      if (newLines.length === 0) {
        // If no items left, cancel the whole order
        await db.tableOrders.update(currentTableOrder.id, {
          status: "cancelled",
          cancelledReason: `Item cancelled: ${line.name} - ${cancelItemReason.trim()}`,
          workPeriodId: currentWorkPeriod?.id,
          updatedAt: Date.now(),
        });
        toast({ title: "Order cancelled (last item removed)" });
        setCancelItemIdx(null);
        setCancelItemReason("");
        setCheckoutOpen(false);
        backToTables();
      } else {
        const newSubtotal = newLines.reduce((s, l) => s + l.subtotal, 0);
        const { taxAmount: newTax, serviceChargeAmount: newService } = calculateCharges(newSubtotal, settings);
        await db.tableOrders.update(currentTableOrder.id, {
          lines: newLines,
          subtotal: newSubtotal,
          taxAmount: newTax,
          serviceChargeAmount: newService,
          total: newSubtotal + newTax + newService,
          updatedAt: Date.now(),
        });
        toast({ title: `${line.name} cancelled` });
        setCancelItemIdx(null);
        setCancelItemReason("");
      }

      await refreshAfterMutation();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const cancelTableOrder = async (reason: string) => {
    if (!currentTableOrder) return;
    if (!reason.trim()) {
      toast({ title: "Enter cancellation reason", variant: "destructive" });
      return;
    }

    try {
      // Restock inventory for cancelled order
      for (const l of currentTableOrder.lines) {
        const item = itemsById[l.itemId];
        if (!item?.trackInventory) continue;
        const row = await db.inventory.get(l.itemId);
        const current = row?.quantity ?? 0;
        await db.inventory.put({ itemId: l.itemId, quantity: current + l.qty, updatedAt: Date.now() });
      }

      await db.tableOrders.update(currentTableOrder.id, {
        status: "cancelled",
        cancelledReason: reason.trim(),
        workPeriodId: currentWorkPeriod?.id,
        updatedAt: Date.now(),
      });
      toast({ title: "Order cancelled" });
      backToTables();
      await refreshAfterMutation();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  if (!settings?.tableManagementEnabled) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Table Management is not enabled.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Ask your admin to enable it in Settings → Table Management.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Waiters cannot start work periods — they must wait for admin/cashier
  if (!isWorkPeriodActive) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <p className="text-muted-foreground">No active work period.</p>
            <p className="text-sm text-muted-foreground">
              An admin or cashier must start a work period before you can take orders.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tableSelectionDisabled = !!settings?.tableSelectionDisabled;

  // Table Grid View
  if (viewMode === "tables" && !tableSelectionDisabled) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">Table Management</h1>
          <p className="text-sm text-muted-foreground">Select a table to take orders.</p>
        </header>

        {visibleTables.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                {isWaiter && settings?.waiterRestrictToOwnTables
                  ? "No tables assigned to you. Ask admin to assign tables."
                  : "No tables configured."}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Admin can add tables in Admin → Tables & Waiters.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {visibleTables.map((table) => {
              const order = getTableOrder(table.id);
              const hasOrder = !!order;
              return (
                <Button
                  key={table.id}
                  variant={hasOrder ? "default" : "outline"}
                  className={cn(
                    "h-24 flex flex-col items-center justify-center gap-1",
                    hasOrder && "bg-primary"
                  )}
                  onClick={() => openTable(table.id)}
                >
                  <UtensilsCrossed className="h-6 w-6" />
                  <span className="font-bold">Table {table.tableNumber}</span>
                  {hasOrder && (
                    <span className="text-xs opacity-80">
                      {formatIntMoney(order.total)}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Order View
  const selectedTable = selectedTableId ? tablesById[selectedTableId] : null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">
            {tableSelectionDisabled ? "Waiter Order" : `Table ${selectedTable?.tableNumber}`}
          </h1>
          {currentTableOrder && (
            <p className="text-sm text-muted-foreground">
              Existing bill: {formatIntMoney(currentTableOrder.total)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void generateMenuPdf().catch((e: any) => toast({ title: "Share failed", description: e?.message ?? String(e), variant: "destructive" }))}>
            <Share2 className="h-4 w-4 mr-1" />
            Share Menu
          </Button>
          {!tableSelectionDisabled && (
            <Button variant="outline" onClick={backToTables}>
              <X className="h-4 w-4 mr-1" />
              Back to Tables
            </Button>
          )}
        </div>
      </div>

      {/* Table Selection - always visible for all roles */}
      {visibleTables.length > 0 && (
        <div className="flex items-center gap-2">
          <Label className="shrink-0">Table (optional):</Label>
          <select
            value={selectedTableId}
            onChange={(e) => setSelectedTableId(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm flex-1 max-w-xs"
          >
            <option value="">No table</option>
            {visibleTables.map((t) => (
              <option key={t.id} value={t.id}>Table {t.tableNumber}</option>
            ))}
          </select>
        </div>
      )}

      {/* Waiter Selection */}
      <div className="flex items-center gap-2">
        <Label className="shrink-0">Waiter:</Label>
        <select
          value={selectedWaiterId}
          onChange={(e) => setSelectedWaiterId(e.target.value)}
          disabled={isWaiter && !isSupervisor && !!loggedInWaiter}
          className="h-9 rounded-md border bg-background px-3 text-sm flex-1 max-w-xs disabled:opacity-70"
        >
          <option value="">Select waiter...</option>
          {(isWaiter && !isSupervisor && loggedInWaiter
            ? [loggedInWaiter]
            : waiters
          ).map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategoryId ?? "all"} onValueChange={(v) => setActiveCategoryId(v === "all" ? null : v)}>
        <TabsList className="flex overflow-x-auto no-scrollbar w-full justify-start flex-nowrap h-auto">
          <TabsTrigger value="all" className="shrink-0">All</TabsTrigger>
          {categories.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="shrink-0">{c.name}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search */}
      <Input
        placeholder="Search items..."
        value={itemQuery}
        onChange={(e) => setItemQuery(e.target.value)}
        className="max-w-sm"
      />

      {/* Items Grid - 4 cols × 2 rows, horizontal scroll (same as Sales Dashboard) */}
      <div className="w-full overflow-x-auto overflow-y-hidden pb-2 overscroll-x-contain touch-manipulation" style={{ WebkitOverflowScrolling: "touch" }}>
        <div
          className="grid grid-rows-2 grid-flow-col gap-2"
          style={{ gridAutoColumns: 'calc(25% - 0.375rem)' }}
        >
          {filteredItems.map((item) => {
            const inCart = cart.find((l) => l.itemId === item.id);
            const stock = inventory[item.id] ?? 0;
            const outOfStock = item.trackInventory && stock <= 0;
            const hasVariants = item.variations && item.variations.length > 0;
            const hasAddOns = item.addOns && item.addOns.length > 0;
            const hasOptions = hasVariants || hasAddOns;

            const itemCard = (
              <div
                className={cn(
                  "rounded-lg border bg-card p-2 text-left shadow-sm transition-colors hover:bg-accent relative cursor-pointer",
                  inCart && "border-primary bg-primary/10",
                  outOfStock && "opacity-50 cursor-not-allowed",
                )}
              >
                {showItemImages && item.imagePath && (
                  <div className="mb-1 aspect-square overflow-hidden rounded-md">
                    <ItemImageThumb imagePath={item.imagePath} alt={item.name} />
                  </div>
                )}
                <div className="text-xs font-semibold leading-tight truncate">{item.name}</div>
                <div className="text-sm font-bold">{formatIntMoney(item.price)}</div>
                {hasVariants && (
                  <div className="text-[10px] text-primary">+{item.variations!.length} variant{item.variations!.length > 1 ? "s" : ""}</div>
                )}
                {hasAddOns && (
                  <div className="text-[10px] text-primary">+{item.addOns!.length} add-on{item.addOns!.length > 1 ? "s" : ""}</div>
                )}
                {item.trackInventory && (
                  <div className={cn("text-[10px]", stock <= 0 ? "text-destructive" : stock <= 5 ? "text-orange-500 dark:text-orange-400" : "text-muted-foreground")}>
                    Stock: {stock}
                  </div>
                )}
                {inCart && (
                  <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs px-1.5 rounded-full">
                    {inCart.qty}
                  </span>
                )}
              </div>
            );

            if (hasOptions) {
              return (
                <DropdownMenu key={item.id}>
                  <DropdownMenuTrigger asChild disabled={outOfStock}>
                    {itemCard}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48 bg-popover z-50" align="start">
                    <DropdownMenuLabel className="text-xs">{item.name}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={outOfStock}
                      onClick={() => addToCart(item, item.price)}
                    >
                      <div className="flex w-full justify-between items-center">
                        <span>Default</span>
                        <div className="flex items-center gap-2">
                          {item.trackInventory && (
                            <span className={cn("text-[10px]", stock <= 0 ? "text-destructive" : "text-muted-foreground")}>
                              ({stock})
                            </span>
                          )}
                          <span className="font-bold">{formatIntMoney(item.price)}</span>
                        </div>
                      </div>
                    </DropdownMenuItem>
                    {hasVariants && item.variations!.map((v, idx) => {
                      const vStock = v.stock ?? 0;
                      const vOut = item.trackInventory && vStock <= 0;
                      return (
                        <DropdownMenuItem
                          key={idx}
                          disabled={vOut}
                          onClick={() => addToCart(item, v.price)}
                        >
                          <div className="flex w-full justify-between items-center">
                            <span>{v.name}</span>
                            <div className="flex items-center gap-2">
                              {item.trackInventory && (
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
                    {hasAddOns && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Add-ons</DropdownMenuLabel>
                        {item.addOns!.map((ao, idx) => (
                          <DropdownMenuItem
                            key={`ao-${idx}`}
                            onClick={() => {
                              const aoKey = `${item.id}__ao_${ao.name}`;
                              const aoName = `${item.name} + ${ao.name}`;
                              setCart((prev) => {
                                const existIdx = prev.findIndex((p) => p.itemId === aoKey);
                                if (existIdx === -1) return [...prev, { itemId: aoKey, name: aoName, unitPrice: ao.price, qty: 1 }];
                                const next = [...prev];
                                next[existIdx] = { ...next[existIdx], qty: next[existIdx].qty + 1 };
                                return next;
                              });
                            }}
                          >
                            <div className="flex w-full justify-between items-center">
                              <span>{ao.name}</span>
                              <span className="font-bold">{formatIntMoney(ao.price)}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => addToCart(item)}
                disabled={outOfStock}
                className={cn(
                  "rounded-lg border bg-card p-2 text-left shadow-sm transition-colors hover:bg-accent relative",
                  inCart && "border-primary bg-primary/10",
                  outOfStock && "opacity-50 cursor-not-allowed",
                )}
              >
                {showItemImages && item.imagePath && (
                  <div className="mb-1 aspect-square overflow-hidden rounded-md">
                    <ItemImageThumb imagePath={item.imagePath} alt={item.name} />
                  </div>
                )}
                <div className="text-xs font-semibold leading-tight truncate">{item.name}</div>
                <div className="text-sm font-bold">{formatIntMoney(item.price)}</div>
                {item.trackInventory && (
                  <div className={cn("text-[10px]", stock <= 0 ? "text-destructive" : stock <= 5 ? "text-orange-500 dark:text-orange-400" : "text-muted-foreground")}>
                    Stock: {stock}
                  </div>
                )}
                {inCart && (
                  <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs px-1.5 rounded-full">
                    {inCart.qty}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">New Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 py-2">
            {cart.map((line) => (
              <div key={line.itemId} className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm truncate block">{line.name}</span>
                  {priceEditItemId === line.itemId ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Input
                        inputMode="numeric"
                        value={priceEditValue === 0 ? "" : String(priceEditValue)}
                        onChange={(e) => setPriceEditValue(parseNonDecimalInt(e.target.value))}
                        className="h-6 w-16 text-xs px-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const realId = line.itemId.includes("__v") ? line.itemId.split("__v")[0] : line.itemId;
                            const basePrice = itemsById[realId]?.price ?? line.unitPrice;
                            if (priceEditValue >= basePrice) {
                              setCart((prev) => prev.map((cl) => cl.itemId === line.itemId ? { ...cl, unitPrice: priceEditValue } : cl));
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
                          const realId = line.itemId.includes("__v") ? line.itemId.split("__v")[0] : line.itemId;
                          const basePrice = itemsById[realId]?.price ?? line.unitPrice;
                          if (priceEditValue >= basePrice) {
                            setCart((prev) => prev.map((cl) => cl.itemId === line.itemId ? { ...cl, unitPrice: priceEditValue } : cl));
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
                      className="text-[10px] text-muted-foreground cursor-pointer hover:underline"
                      onClick={() => {
                        setPriceEditItemId(line.itemId);
                        setPriceEditValue(line.unitPrice);
                      }}
                    >
                      {formatIntMoney(line.unitPrice)} ea
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(line.itemId, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm">{line.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(line.itemId, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <span className="w-20 text-right text-sm font-medium">
                  {formatIntMoney(line.unitPrice * line.qty)}
                </span>
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between font-medium">
              <span>Cart Total</span>
              <span>{formatIntMoney(subtotal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Order Items */}
      {currentTableOrder && currentTableOrder.lines.length > 0 && (
        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Existing Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 py-2">
            {currentTableOrder.lines.map((line, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="flex-1 truncate">{line.name}</span>
                <span className="text-muted-foreground mx-2">x{line.qty}</span>
                <span className="font-medium">{formatIntMoney(line.subtotal)}</span>
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between font-medium">
              <span>Existing Total</span>
              <span>{formatIntMoney(currentTableOrder.total)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap pb-20">
        <Button 
          onClick={() => void saveOrder(true)} 
          disabled={cart.length === 0 || !selectedWaiterId}
          variant="default"
        >
          <ClipboardList className="h-4 w-4 mr-1" />
          KOT
        </Button>
        <Button
          onClick={() => void saveOrder(false)}
          disabled={cart.length === 0 || !selectedWaiterId}
          variant="secondary"
        >
          <Save className="h-4 w-4 mr-1" />
          Save
        </Button>
        <Button 
          variant="outline" 
          onClick={clearCart} 
          disabled={cart.length === 0}
        >
          Clear Cart
        </Button>
        <div className="flex-1" />
        {currentTableOrder && (
          <Button onClick={openCheckout} variant="default">
            <CreditCard className="h-4 w-4 mr-1" />
            Checkout ({formatIntMoney(currentTableOrder.total)})
          </Button>
        )}
      </div>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Checkout {selectedTable ? `- Table ${selectedTable.tableNumber}` : ""}
            </DialogTitle>
          </DialogHeader>

          {currentTableOrder && (
            <div className="space-y-3">
              {/* Order Items */}
              <div className="rounded-md border">
                <div className="px-3 py-2 bg-muted/40 text-xs font-medium">Order Items</div>
                <div className="divide-y">
                  {currentTableOrder.lines.map((line, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-1.5 text-sm gap-1">
                      <span className="flex-1 truncate">{line.name}</span>
                      <span className="text-muted-foreground">x{line.qty}</span>
                      <span className="font-medium">{formatIntMoney(line.subtotal)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive shrink-0"
                        onClick={() => {
                          setCancelItemIdx(idx);
                          setCancelItemReason("");
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatIntMoney(currentTableOrder.subtotal)}</span>
                </div>
                
                {/* Discount Input */}
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Discount</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={discountAmount || ""}
                    onChange={(e) => setDiscountAmount(parseNonDecimalInt(e.target.value))}
                    className="h-8 w-24"
                  />
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount</span>
                    <span>-{formatIntMoney(Math.min(discountAmount, currentTableOrder.subtotal))}</span>
                  </div>
                )}

                {settings?.taxEnabled && (
                  <div className="flex items-center justify-between">
                    <span>{settings?.taxLabel || "Tax"}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={editTaxAmount ?? currentTableOrder.taxAmount}
                      onChange={(e) => setEditTaxAmount(parseNonDecimalInt(e.target.value))}
                      className="h-7 w-24 text-right text-sm"
                    />
                  </div>
                )}
                {settings?.serviceChargeEnabled && (
                  <div className="flex items-center justify-between">
                    <span>{settings?.serviceChargeLabel || "Service"}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={editServiceAmount ?? currentTableOrder.serviceChargeAmount}
                      onChange={(e) => setEditServiceAmount(parseNonDecimalInt(e.target.value))}
                      className="h-7 w-24 text-right text-sm"
                    />
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span>
                  <span>
                    {formatIntMoney(
                      Math.max(0, currentTableOrder.subtotal - Math.min(discountAmount, currentTableOrder.subtotal)) +
                      (editTaxAmount ?? currentTableOrder.taxAmount) +
                      (editServiceAmount ?? currentTableOrder.serviceChargeAmount)
                    )}
                  </span>
                </div>
              </div>

              {/* Credit Customer */}
              <div className="space-y-2">
                <Label>Credit Customer (optional)</Label>
                <select
                  value={creditCustomerId}
                  onChange={(e) => setCreditCustomerId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">-- Cash Payment --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {!creditCustomerId && canCreateCustomers && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="New customer name"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                    />
                    <Input
                      placeholder="Mobile (optional)"
                      value={newCustomerMobile}
                      onChange={(e) => setNewCustomerMobile(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 flex-wrap">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setCancelCheckoutReason("");
                setCancelCheckoutOpen(true);
              }}
            >
              Cancel Order
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
              Back
            </Button>
            {creditCustomerId || newCustomerName.trim() ? (
              <>
                {!isSubKotOnly && (
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => void completeCheckout("credit", true)}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    Print Credit
                  </Button>
                )}
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => void completeCheckout("credit", false)}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save Credit
                </Button>
              </>
            ) : (
              <>
                {!isSubKotOnly && (
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => void completeCheckout("cash", true)}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    Print
                  </Button>
                )}
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => void completeCheckout("cash", false)}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order from Checkout Dialog */}
      <Dialog open={cancelCheckoutOpen} onOpenChange={setCancelCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will cancel the order. This action cannot be undone.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cancelCheckoutReason">Reason for cancellation</Label>
              <Input
                id="cancelCheckoutReason"
                value={cancelCheckoutReason}
                onChange={(e) => setCancelCheckoutReason(e.target.value)}
                placeholder="Enter reason..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelCheckoutOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" onClick={() => void handleCancelFromCheckout()}>
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Specific Item Dialog */}
      <Dialog open={cancelItemIdx !== null} onOpenChange={() => setCancelItemIdx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {cancelItemIdx !== null && currentTableOrder?.lines[cancelItemIdx] && (
              <p className="text-sm">
                Cancel <strong>{currentTableOrder.lines[cancelItemIdx].name}</strong> (x{currentTableOrder.lines[cancelItemIdx].qty})?
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="cancelItemReason">Reason</Label>
              <Input
                id="cancelItemReason"
                value={cancelItemReason}
                onChange={(e) => setCancelItemReason(e.target.value)}
                placeholder="Enter reason..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelItemIdx(null)}>Back</Button>
            <Button variant="destructive" onClick={() => void cancelSpecificItem()}>Cancel Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdRewardDialog
        open={adOpen}
        onOpenChange={setAdOpen}
        module="table"
        message={adMsg}
        onRewarded={() => {}}
        needsOnlineVerification={adNeedsOnlineCheck}
      />
    </div>
  );
}
