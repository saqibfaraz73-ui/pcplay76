/**
 * Kitchen Display System — Database types
 */
import type { OrderLine, TableOrderLine } from "./schema";

export type KitchenOrderStatus = "pending" | "preparing" | "ready" | "served" | "cancelled";

export type KitchenOrder = {
  id: string;
  /** Source order ID (from orders or tableOrders table) */
  sourceOrderId: string;
  /** "pos" = from sales dashboard, "table" = from table management */
  sourceType: "pos" | "table";
  /** Receipt/order number for display */
  orderNumber: number;
  /** Table number (if from table order) */
  tableNumber?: string;
  /** Waiter name (if from table order) */
  waiterName?: string;
  /** Customer name (if available) */
  customerName?: string;
  /** Items to prepare */
  items: KitchenOrderItem[];
  /** Current status */
  status: KitchenOrderStatus;
  /** Notes/special instructions */
  note?: string;
  /** Timestamps */
  createdAt: number;
  updatedAt: number;
  /** When status changed to "preparing" */
  preparingAt?: number;
  /** When status changed to "ready" */
  readyAt?: number;
  /** When status changed to "served" */
  servedAt?: number;
};

export type KitchenOrderItem = {
  name: string;
  qty: number;
  note?: string;
};
