import { db } from "@/db/appDb";
import type { Discount, MenuItem, Order, OrderLine, PaymentMethod } from "@/db/schema";
import { isSameLocalDay } from "@/features/pos/time";
import { canMakeSale, incrementSaleCount, type SalesModule } from "@/features/licensing/licensing-db";

function makeId(prefix: string) {
  // crypto.randomUUID is not available in some older webviews.
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto as any).randomUUID() : Math.random().toString(16).slice(2);
  return `${prefix}_${rand}_${Date.now().toString(16)}`;
}

export async function createOrder(args: {
  cashier: string;
  paymentMethod: PaymentMethod;
  creditCustomerId?: string;
  deliveryPersonId?: string;
  deliveryCustomerName?: string;
  deliveryCustomerAddress?: string;
  deliveryCustomerPhone?: string;
  discountAmount: number; // amount-only discount (no decimals)
  cart: Array<{ itemId: string; name: string; unitPrice: number; qty: number }>;
  itemsById: Record<string, MenuItem>;
  workPeriodId?: string;
  taxAmount?: number;
  serviceChargeAmount?: number;
}): Promise<Order> {
  const now = Date.now();

  if (args.cart.length === 0) {
    throw new Error("Cart is empty.");
  }
  if (args.paymentMethod === "credit" && !args.creditCustomerId) {
    throw new Error("Credit customer is required.");
  }
  if (args.paymentMethod === "delivery" && !args.deliveryPersonId) {
    throw new Error("Delivery person is required.");
  }

  // License limit check
  const moduleMap: Record<PaymentMethod, SalesModule> = { cash: "cash", credit: "credit", delivery: "delivery" };
  const saleModule = moduleMap[args.paymentMethod] ?? "cash";
  const limitCheck = await canMakeSale(saleModule);
  if (!limitCheck.allowed) {
    throw new Error(`__UPGRADE__${limitCheck.message}`);
  }

  // Build lines (include expiry date and buying price from item/variant)
  // Cart itemId may contain variant suffix (__v{price}) or add-on suffix (__ao_), strip for inventory lookups
  const getRealItemId = (cartKey: string) => cartKey.includes("__") ? cartKey.split("__")[0] : cartKey;

  const lines: OrderLine[] = args.cart.map((l) => {
    const realId = getRealItemId(l.itemId);
    const item = args.itemsById[realId];
    // Determine buying price: check variant match first, then base item
    // Add-on lines have no cost price — set buyingPrice to undefined
    let buyingPrice: number | undefined;
    if (l.itemId.includes("__ao_")) {
      buyingPrice = undefined; // add-ons have no buying price
    } else if (l.itemId.includes("__v") && item?.variations) {
      const variant = item.variations.find(v => v.price === l.unitPrice);
      buyingPrice = variant?.buyingPrice != null ? variant.buyingPrice : item?.buyingPrice;
    } else {
      buyingPrice = item?.buyingPrice;
    }
    return {
      itemId: realId,
      name: l.name,
      qty: l.qty,
      unitPrice: Math.round(l.unitPrice),
      buyingPrice: buyingPrice != null ? Math.round(buyingPrice) : undefined,
      subtotal: Math.round(l.unitPrice) * l.qty,
      expiryDate: item?.expiryDate,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const discountTotal = Math.min(Math.max(0, Math.round(args.discountAmount)), subtotal);

  const discount: Discount = discountTotal > 0 ? { type: "amount", value: discountTotal } : { type: "none" };
  const taxAmount = args.taxAmount ?? 0;
  const serviceChargeAmount = args.serviceChargeAmount ?? 0;
  const total = subtotal - discountTotal + taxAmount + serviceChargeAmount;

  // Check if Sub device is connected to Main — if so, send order to Main only
  let isSubConnected = false;
  try {
    const { getSyncConfig } = await import("@/features/sync/sync-utils");
    const config = getSyncConfig();
    if (config.role === "sub" && config.mainAppIp) {
      isSubConnected = true;
    }
  } catch {
    // Sync module not available
  }

  if (isSubConnected) {
    // Sub device: save locally AND send to Main (so Sub reports also work)
    const counter = (await db.counters.get("receipt")) ?? { id: "receipt" as const, next: 1 };
    const receiptNo = counter.next;
    await db.counters.put({ id: "receipt", next: receiptNo + 1 });

    const order: Order = {
      id: makeId("ord"),
      receiptNo,
      cashier: args.cashier,
      status: "completed",
      paymentMethod: args.paymentMethod,
      creditCustomerId: args.creditCustomerId,
      deliveryPersonId: args.deliveryPersonId,
      deliveryCustomerName: args.deliveryCustomerName,
      deliveryCustomerAddress: args.deliveryCustomerAddress,
      deliveryCustomerPhone: args.deliveryCustomerPhone,
      discount,
      lines,
      subtotal,
      discountTotal,
      taxAmount,
      serviceChargeAmount,
      total,
      workPeriodId: args.workPeriodId,
      createdAt: now,
      updatedAt: now,
    };

    // Always save locally so Sub's own reports work
    await db.orders.put(order);

    // Also send to Main device for centralized reporting
    try {
      const { sendToMainApp } = await import("@/features/sync/sync-client");
      const { getLicense } = await import("@/features/licensing/licensing-db");
      const lic = await getLicense();
      const res = await sendToMainApp("order", order, lic.deviceId);
      if (!res.success) {
        console.warn("[Sync] Main rejected order:", res.error);
      }
    } catch (e) {
      console.warn("[Sync] Failed to send order to Main:", e);
    }

    await incrementSaleCount(saleModule);
    return order;
  }

  // Main device or standalone: save locally as before
  const createdOrder = await db.transaction("rw", db.orders, db.inventory, db.counters, db.license, async () => {
    // Receipt counter
    const counter = (await db.counters.get("receipt")) ?? { id: "receipt" as const, next: 1 };
    const receiptNo = counter.next;
    await db.counters.put({ id: "receipt", next: receiptNo + 1 });

    // Inventory checks + updates (block oversell)
    for (const l of args.cart) {
      const realId = getRealItemId(l.itemId);
      const item = args.itemsById[realId];
      if (!item?.trackInventory) continue;
      const row = await db.inventory.get(realId);
      const available = row?.quantity ?? 0;
      if (l.qty > available) {
        throw new Error(`Insufficient stock for ${l.name}. Available: ${available}`);
      }
    }
    for (const l of args.cart) {
      const realId = getRealItemId(l.itemId);
      const item = args.itemsById[realId];
      if (!item?.trackInventory) continue;
      const row = await db.inventory.get(realId);
      const available = row?.quantity ?? 0;
      await db.inventory.put({ itemId: realId, quantity: available - l.qty, updatedAt: now });
    }

    const order: Order = {
      id: makeId("ord"),
      receiptNo,
      cashier: args.cashier,
      status: "completed",
      paymentMethod: args.paymentMethod,
      creditCustomerId: args.creditCustomerId,
      deliveryPersonId: args.deliveryPersonId,
      deliveryCustomerName: args.deliveryCustomerName,
      deliveryCustomerAddress: args.deliveryCustomerAddress,
      deliveryCustomerPhone: args.deliveryCustomerPhone,
      discount,
      lines,
      subtotal,
      discountTotal,
      taxAmount,
      serviceChargeAmount,
      total,
      workPeriodId: args.workPeriodId,
      createdAt: now,
      updatedAt: now,
    };

    await db.orders.put(order);

    // Increment sale counter after successful order
    await incrementSaleCount(saleModule);

    return order;
  });

  return createdOrder;
}

export async function cancelOrder(args: { orderId: string; reason: string }): Promise<Order> {
  const now = Date.now();

  return await db.transaction("rw", db.orders, db.inventory, db.items, async () => {
    const order = await db.orders.get(args.orderId);
    if (!order) throw new Error("Order not found.");
    if (order.status !== "completed") throw new Error("Only completed orders can be cancelled.");
    if (!isSameLocalDay(order.createdAt, now)) throw new Error("Same-day cancellation only.");

    const reason = (args.reason ?? "").trim();
    if (!reason) throw new Error("Cancellation reason is required.");

    // Restock inventory for tracked items
    for (const l of order.lines) {
      const item = await db.items.get(l.itemId);
      if (!item?.trackInventory) continue;
      const row = await db.inventory.get(l.itemId);
      const current = row?.quantity ?? 0;
      await db.inventory.put({ itemId: l.itemId, quantity: current + l.qty, updatedAt: now });
    }

    const next: Order = {
      ...order,
      status: "cancelled",
      cancelledReason: reason,
      updatedAt: now,
    };
    await db.orders.put(next);
    return next;
  });
}
