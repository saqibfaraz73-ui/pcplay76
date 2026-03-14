/**
 * Kitchen Handler — Provides kitchen order data from Main device's DB.
 * 
 * The native LocalSyncServer plugin handles HTTP routing.
 * These functions are called by the sync handler to respond to 
 * kitchen-specific GET requests.
 */
import { db } from "@/db/appDb";
import type { KitchenOrder, KitchenOrderStatus } from "@/db/kitchen-schema";

/** Get all kitchen orders (for kitchen staff view) */
export async function getKitchenOrders(): Promise<KitchenOrder[]> {
  return db.kitchenOrders
    .orderBy("createdAt")
    .reverse()
    .limit(100)
    .toArray();
}

/** Get active kitchen orders for customer display (only pending/preparing/ready) */
export async function getKitchenDisplayOrders(): Promise<KitchenOrder[]> {
  const all = await db.kitchenOrders
    .orderBy("createdAt")
    .reverse()
    .limit(50)
    .toArray();
  return all.filter(o => o.status === "pending" || o.status === "preparing" || o.status === "ready");
}

/** Create a kitchen order from a POS order */
export async function createKitchenOrderFromOrder(
  sourceOrderId: string,
  orderNumber: number,
  items: Array<{ name: string; qty: number }>,
  sourceType: "pos" | "table" = "pos",
  extra?: { tableNumber?: string; waiterName?: string; customerName?: string; note?: string }
): Promise<KitchenOrder> {
  const id = `ko_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  const order: KitchenOrder = {
    id,
    sourceOrderId,
    sourceType,
    orderNumber,
    tableNumber: extra?.tableNumber,
    waiterName: extra?.waiterName,
    customerName: extra?.customerName,
    items: items.map(i => ({ name: i.name, qty: i.qty })),
    status: "pending",
    note: extra?.note,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.kitchenOrders.put(order);
  return order;
}

/** Update kitchen order status */
export async function updateKitchenOrderStatus(
  orderId: string,
  status: KitchenOrderStatus
): Promise<boolean> {
  const existing = await db.kitchenOrders.get(orderId);
  if (!existing) return false;
  const updates: Partial<KitchenOrder> = { status, updatedAt: Date.now() };
  if (status === "preparing") updates.preparingAt = Date.now();
  if (status === "ready") updates.readyAt = Date.now();
  if (status === "served") updates.servedAt = Date.now();
  await db.kitchenOrders.update(orderId, updates);
  return true;
}
