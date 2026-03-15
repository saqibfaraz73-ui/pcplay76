/**
 * Sync Handler — Processes incoming sync data on the MAIN device.
 *
 * When a Sub device sends an order, expense, table order, etc.,
 * this handler saves it into the Main device's local Dexie database
 * and optionally forwards print jobs to the connected printer.
 */
import { db } from "@/db/appDb";
import type { Order, Expense, TableOrder, WorkPeriod, SupplierArrival, SupplierPayment } from "@/db/schema";
import type { AdvanceOrder, BookingOrder } from "@/db/booking-schema";
import type { KitchenOrder, KitchenOrderStatus } from "@/db/kitchen-schema";
import type { SyncPayload, PrintJobPayload, SyncEndpoint } from "./sync-types";


/** Dedup guard for all sync events — prevent processing same event multiple times */
const recentSyncEvents = new Map<string, number>();
const SYNC_DEDUP_WINDOW_MS = 3000;

/**
 * Route incoming sync data to the correct handler based on endpoint.
 */
export async function handleSyncData(
  payload: SyncPayload,
  endpoint: string
): Promise<void> {
  // Dedup: native plugin may fire the same event multiple times
  const eventKey = `${endpoint}_${payload.sentAt}_${payload.sourceDeviceId}`;
  const now = Date.now();
  if (recentSyncEvents.has(eventKey) && now - recentSyncEvents.get(eventKey)! < SYNC_DEDUP_WINDOW_MS) {
    console.log(`[Sync] Duplicate event ignored: ${endpoint} from ${payload.sourceDeviceId}`);
    return;
  }
  recentSyncEvents.set(eventKey, now);
  // Cleanup old entries
  for (const [k, t] of recentSyncEvents) {
    if (now - t > SYNC_DEDUP_WINDOW_MS * 2) recentSyncEvents.delete(k);
  }

  console.log(`[Sync] Received ${endpoint} from ${payload.sourceDeviceId}`);

  switch (endpoint as SyncEndpoint | "verify-pin") {
    case "verify-pin":
      // PIN verification is handled separately — not a data sync endpoint
      // Actual verification happens in SyncSettingsPanel's onSyncDataReceived
      break;
    case "order":
      await handleOrderSync(payload.data as Order);
      break;
    case "table-order":
      await handleTableOrderSync(payload.data as TableOrder);
      break;
    case "credit-payment":
      await handleCreditPaymentSync(payload.data);
      break;
    case "expense":
      await handleExpenseSync(payload.data as Expense);
      break;
    case "print":
      await handlePrintJob(payload.data as PrintJobPayload);
      break;
    case "work-period":
      await handleWorkPeriodSync(payload.data as WorkPeriod);
      break;
    case "bulk":
      await handleBulkSync(payload.data as Array<{ endpoint: SyncEndpoint; data: unknown }>);
      break;
    case "party-lodge-arrival":
      await handlePartyLodgeArrivalSync(payload.data as { supplier: any; arrival: SupplierArrival });
      break;
    case "party-lodge-payment":
      await handlePartyLodgePaymentSync(payload.data as { supplier: any; payment: SupplierPayment; expense?: Expense });
      break;
    case "advance-order":
      await handleAdvanceOrderSync(payload.data as AdvanceOrder);
      break;
    case "booking-order":
      await handleBookingOrderSync(payload.data as BookingOrder);
      break;
    case "kitchen-order":
      await handleKitchenOrderSync(payload.data as KitchenOrder);
      break;
    case "kitchen-status-update":
      await handleKitchenStatusUpdate(payload.data as { orderId: string; status: KitchenOrderStatus; updatedAt: number });
      break;
    default:
      console.warn(`[Sync] Unknown endpoint: ${endpoint}`);
  }
}

/** Save a synced order into the Main device's database, remapping workPeriodId to Main's active work period */
async function handleOrderSync(order: Order): Promise<void> {
  const existing = await db.orders.get(order.id);
  if (existing) {
    console.log(`[Sync] Order ${order.id} already exists, skipping`);
    return;
  }
  // Remap workPeriodId to Main's active (open) work period so reports group correctly
  const mainWp = await db.workPeriods.filter((wp) => !wp.isClosed).first();
  if (mainWp) {
    order.workPeriodId = mainWp.id;
    console.log(`[Sync] Remapped order workPeriodId to Main's active WP: ${mainWp.id}`);
  }
  await db.orders.put(order);
  console.log(`[Sync] Order ${order.id} saved (receipt #${order.receiptNo}, wp: ${order.workPeriodId})`);

  // Auto-create kitchen order if KDS enabled (fallback in case Sub didn't send kitchen-order)
  try {
    const settings = await db.settings.get("app");
    if (settings?.kitchenDisplayEnabled) {
      const existing_ko = await db.kitchenOrders.where("sourceOrderId").equals(order.id).first();
      if (!existing_ko) {
        const { createKitchenOrderFromOrder } = await import("@/features/kitchen/kitchen-handler");
        await createKitchenOrderFromOrder(
          order.id,
          order.receiptNo,
          order.lines.map((l: any) => ({ name: l.name, qty: l.qty })),
          "pos"
        );
        console.log(`[Sync] Kitchen order auto-created for synced order #${order.receiptNo}`);
      }
    }
  } catch (e) {
    console.warn("[Sync] Failed to auto-create kitchen order:", e);
  }
}

/** Save a synced table order (keeps Sub's original workPeriodId). Only saves completed/cancelled orders to avoid "stuck" open orders on Main. */
async function handleTableOrderSync(tableOrder: TableOrder & { _waiterName?: string; _tableNumber?: string }): Promise<void> {
  const isOpenOrder = tableOrder.status === "open";

  // For open table orders: don't save to Main's table management (they'd get stuck),
  // but DO create kitchen orders so they appear on displays
  if (isOpenOrder) {
    console.log(`[Sync] Open table order ${tableOrder.id} — creating kitchen order only (not saving to Main tables)`);
    try {
      const settings = await db.settings.get("app");
      if (settings?.kitchenDisplayEnabled) {
        const existing_ko = await db.kitchenOrders.where("sourceOrderId").equals(tableOrder.id).first();
        if (!existing_ko) {
          const { createKitchenOrderFromOrder } = await import("@/features/kitchen/kitchen-handler");
          await createKitchenOrderFromOrder(
            tableOrder.id,
            tableOrder.receiptNo ?? 0,
            tableOrder.lines.map((l: any) => ({ name: l.name, qty: l.qty })),
            "table",
            { tableNumber: tableOrder._tableNumber, waiterName: tableOrder._waiterName }
          );
          console.log(`[Sync] Kitchen order created for open table order`);
        }
      }
    } catch (e) {
      console.warn("[Sync] Failed to create kitchen order for open table order:", e);
    }
    return;
  }

  // Map waiter ID: if Main has a waiter with the same name, remap the order to use Main's ID
  if (tableOrder.waiterId) {
    const existingWaiter = await db.waiters.get(tableOrder.waiterId);
    if (!existingWaiter) {
      if (tableOrder._waiterName) {
        // Look for a waiter with the same name on Main
        const mainWaiter = await db.waiters.filter(
          (w) => w.name.toLowerCase() === tableOrder._waiterName!.toLowerCase()
        ).first();
        if (mainWaiter) {
          // Remap to Main's waiter ID so reports group correctly
          tableOrder.waiterId = mainWaiter.id;
          console.log(`[Sync] Remapped waiter to Main's "${mainWaiter.name}" (${mainWaiter.id})`);
        } else {
          await db.waiters.put({
            id: tableOrder.waiterId,
            name: tableOrder._waiterName,
            createdAt: Date.now(),
          });
          console.log(`[Sync] Created waiter record: ${tableOrder._waiterName}`);
        }
      } else {
        // No name provided — create stub record so reports don't show raw IDs
        await db.waiters.put({
          id: tableOrder.waiterId,
          name: `Waiter (${tableOrder.waiterId.slice(-6)})`,
          createdAt: Date.now(),
        });
        console.log(`[Sync] Created stub waiter record for ${tableOrder.waiterId}`);
      }
    }
  }

  // Map table ID: if Main has a table with the same number, remap the order to use Main's ID
  if (tableOrder.tableId && tableOrder._tableNumber) {
    const existingTable = await db.restaurantTables.get(tableOrder.tableId);
    if (!existingTable) {
      const mainTable = await db.restaurantTables.filter(
        (t) => t.tableNumber.toLowerCase() === tableOrder._tableNumber!.toLowerCase()
      ).first();
      if (mainTable) {
        tableOrder.tableId = mainTable.id;
        console.log(`[Sync] Remapped table to Main's "${mainTable.tableNumber}" (${mainTable.id})`);
      } else {
        await db.restaurantTables.put({
          id: tableOrder.tableId,
          tableNumber: tableOrder._tableNumber,
          createdAt: Date.now(),
        });
        console.log(`[Sync] Created table record: ${tableOrder._tableNumber}`);
      }
    }
  }

  // Strip internal sync fields before saving, but preserve waiterName/tableNumber for reports
  const { _waiterName, _tableNumber, ...cleanOrder } = tableOrder;
  // Ensure denormalized names are stored on the order for report display
  if (_waiterName && !cleanOrder.waiterName) cleanOrder.waiterName = _waiterName;
  if (_tableNumber && !cleanOrder.tableNumber) cleanOrder.tableNumber = _tableNumber;

  // Remap workPeriodId to Main's active work period so reports group correctly
  const mainWp = await db.workPeriods.filter((wp) => !wp.isClosed).first();
  if (mainWp) {
    cleanOrder.workPeriodId = mainWp.id;
  }

  const existing = await db.tableOrders.get(cleanOrder.id);
  if (existing) {
    if (cleanOrder.updatedAt > existing.updatedAt) {
      await db.tableOrders.put(cleanOrder);
      console.log(`[Sync] Table order ${cleanOrder.id} updated`);
    }
    return;
  }
  await db.tableOrders.put(cleanOrder);
  console.log(`[Sync] Table order ${cleanOrder.id} saved (wp: ${cleanOrder.workPeriodId})`);
}


/** Save a synced credit payment */
async function handleCreditPaymentSync(data: unknown): Promise<void> {
  const payment = data as { id: string; customerId: string; amount: number; note?: string; createdAt: number };
  const existing = await db.creditPayments.get(payment.id);
  if (existing) return;
  await db.creditPayments.put(payment);
  console.log(`[Sync] Credit payment ${payment.id} saved`);
}

/** Save a synced expense, remapping workPeriodId to Main's active work period */
async function handleExpenseSync(expense: Expense): Promise<void> {
  const existing = await db.expenses.get(expense.id);
  if (existing) return;
  // Remap workPeriodId to Main's active work period
  const mainWp = await db.workPeriods.filter((wp) => !wp.isClosed).first();
  if (mainWp) {
    expense.workPeriodId = mainWp.id;
  }
  await db.expenses.put(expense);
  console.log(`[Sync] Expense ${expense.id} saved (wp: ${expense.workPeriodId})`);
}

/** Dedup guard: track recent print job hashes to prevent duplicate prints */
const recentPrintJobs = new Map<string, number>();
const PRINT_DEDUP_WINDOW_MS = 30000; // ignore duplicate print data within 30 seconds (handles screen-off queuing)

function getPrintJobHash(data: string): string {
  // Simple hash of the first 200 chars + length
  const sample = data.slice(0, 200);
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) - hash + sample.charCodeAt(i)) | 0;
  }
  return `${hash}_${data.length}`;
}

/** Forward a print job to the Main device's connected printer using section-based routing */
async function handlePrintJob(job: PrintJobPayload): Promise<void> {
  try {
    // Decode base64 back to raw string
    const raw = atob(job.printData);

    // Dedup check — skip if same print data was processed recently
    const hash = getPrintJobHash(raw);
    const now = Date.now();
    const lastPrinted = recentPrintJobs.get(hash);
    if (lastPrinted && now - lastPrinted < PRINT_DEDUP_WINDOW_MS) {
      console.log(`[Sync] Duplicate print job ignored (same data within ${PRINT_DEDUP_WINDOW_MS}ms)`);
      return;
    }
    recentPrintJobs.set(hash, now);
    // Cleanup old entries
    for (const [k, t] of recentPrintJobs) {
      if (now - t > PRINT_DEDUP_WINDOW_MS * 2) recentPrintJobs.delete(k);
    }

    const settings = await db.settings.get("app");
    if (!settings) {
      console.warn("[Sync] Main device has no settings, cannot forward print job");
      return;
    }

    // Use section-based printer routing (same as local printing)
    const { sendToSectionPrinter } = await import("@/features/pos/printer-routing");
    const section = job.section ?? "sales";
    await sendToSectionPrinter(settings, section, raw);
    console.log(`[Sync] Print job forwarded via section routing (${section})`);
  } catch (e) {
    console.error("[Sync] Failed to forward print job:", e);
    throw e;
  }
}

/** Save/update a synced work period — Sub work periods are stored but Main uses its own for reports */
async function handleWorkPeriodSync(wp: WorkPeriod): Promise<void> {
  console.log(`[Sync] Work period sync from Sub ignored (Main uses its own work periods)`);
}

/** Save a synced supplier arrival (party lodge) */
async function handlePartyLodgeArrivalSync(data: { supplier: any; arrival: SupplierArrival }): Promise<void> {
  const { supplier, arrival } = data;
  // Ensure supplier exists on Main
  const existingSup = await db.suppliers.get(supplier.id);
  if (!existingSup) {
    await db.suppliers.put(supplier);
    console.log(`[Sync] Created supplier: ${supplier.name}`);
  } else {
    // Update balance
    await db.suppliers.update(supplier.id, { totalBalance: supplier.totalBalance });
  }
  const existingArr = await db.supplierArrivals.get(arrival.id);
  if (existingArr) return;
  await db.supplierArrivals.put(arrival);
  console.log(`[Sync] Supplier arrival ${arrival.id} saved`);
}

/** Save a synced supplier payment (party lodge) */
async function handlePartyLodgePaymentSync(data: { supplier: any; payment: SupplierPayment; expense?: Expense }): Promise<void> {
  const { supplier, payment, expense } = data;
  // Ensure supplier exists on Main
  const existingSup = await db.suppliers.get(supplier.id);
  if (!existingSup) {
    await db.suppliers.put(supplier);
    console.log(`[Sync] Created supplier: ${supplier.name}`);
  }
  const existingPay = await db.supplierPayments.get(payment.id);
  if (existingPay) return;
  await db.supplierPayments.put(payment);
  console.log(`[Sync] Supplier payment ${payment.id} saved`);
  // Also save linked expense if provided
  if (expense) {
    const existingExp = await db.expenses.get(expense.id);
    if (!existingExp) {
      const mainWp = await db.workPeriods.filter((wp) => !wp.isClosed).first();
      if (mainWp) expense.workPeriodId = mainWp.id;
      await db.expenses.put(expense);
      console.log(`[Sync] Linked expense ${expense.id} saved`);
    }
  }
}

/** Save a synced advance order */
async function handleAdvanceOrderSync(order: AdvanceOrder): Promise<void> {
  const existing = await db.advanceOrders.get(order.id);
  if (existing) {
    if (order.updatedAt > existing.updatedAt) {
      await db.advanceOrders.put(order);
      console.log(`[Sync] Advance order ${order.id} updated`);
    }
    return;
  }
  await db.advanceOrders.put(order);
  console.log(`[Sync] Advance order ${order.id} saved`);
}

/** Save a synced booking order */
async function handleBookingOrderSync(order: BookingOrder): Promise<void> {
  const existing = await db.bookingOrders.get(order.id);
  if (existing) {
    if (order.updatedAt > existing.updatedAt) {
      await db.bookingOrders.put(order);
      console.log(`[Sync] Booking order ${order.id} updated`);
    }
    return;
  }
  await db.bookingOrders.put(order);
  console.log(`[Sync] Booking order ${order.id} saved`);
}

/** Save a synced kitchen order */
async function handleKitchenOrderSync(order: KitchenOrder): Promise<void> {
  const existing = await db.kitchenOrders.get(order.id);
  if (existing) {
    if (order.updatedAt > existing.updatedAt) {
      await db.kitchenOrders.put(order);
      console.log(`[Sync] Kitchen order ${order.id} updated`);
    }
    return;
  }
  await db.kitchenOrders.put(order);
  console.log(`[Sync] Kitchen order ${order.id} saved (#${order.orderNumber})`);
}

/** Handle kitchen status update from kitchen device */
async function handleKitchenStatusUpdate(data: { orderId: string; status: KitchenOrderStatus; updatedAt: number }): Promise<void> {
  const existing = await db.kitchenOrders.get(data.orderId);
  if (!existing) {
    console.warn(`[Sync] Kitchen order ${data.orderId} not found for status update`);
    return;
  }
  const updates: Partial<KitchenOrder> = {
    status: data.status,
    updatedAt: data.updatedAt,
  };
  if (data.status === "preparing") updates.preparingAt = data.updatedAt;
  if (data.status === "ready") updates.readyAt = data.updatedAt;
  if (data.status === "served") updates.servedAt = data.updatedAt;
  await db.kitchenOrders.update(data.orderId, updates);
  console.log(`[Sync] Kitchen order ${data.orderId} status → ${data.status}`);
}

/** Handle bulk sync — multiple items in one request */
async function handleBulkSync(
  items: Array<{ endpoint: SyncEndpoint; data: unknown }>
): Promise<void> {
  for (const item of items) {
    const fakePayload: SyncPayload = {
      endpoint: item.endpoint,
      data: item.data,
      sourceDeviceId: "bulk",
      sentAt: Date.now(),
    };
    await handleSyncData(fakePayload, item.endpoint);
  }
}
