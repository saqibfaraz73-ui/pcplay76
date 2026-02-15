/**
 * Sync Handler — Processes incoming sync data on the MAIN device.
 *
 * When a Sub device sends an order, expense, table order, etc.,
 * this handler saves it into the Main device's local Dexie database
 * and optionally forwards print jobs to the connected printer.
 */
import { db } from "@/db/appDb";
import type { Order, Expense, TableOrder, WorkPeriod } from "@/db/schema";
import type { SyncPayload, PrintJobPayload, SyncEndpoint } from "./sync-types";
import { btSend } from "@/features/pos/bluetooth-printer";
import { usbSend } from "@/features/pos/usb-printer";

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

  switch (endpoint as SyncEndpoint) {
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
}

/** Save a synced table order (keeps Sub's original workPeriodId). Only saves completed/cancelled orders to avoid "stuck" open orders on Main. */
async function handleTableOrderSync(tableOrder: TableOrder & { _waiterName?: string; _tableNumber?: string }): Promise<void> {
  // Don't save "open" table orders from Sub on Main — they'd get stuck in Main's table management
  if (tableOrder.status === "open") {
    console.log(`[Sync] Skipping open table order ${tableOrder.id} (only completed/cancelled are synced to Main)`);
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

/** Forward a print job to the Main device's connected printer */
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

    // Auto-detect Main's actual printer connection
    const settings = await db.settings.get("app");
    const conn = settings?.printerConnection ?? "none";

    if (conn === "usb") {
      await usbSend(raw);
    } else if (conn === "bluetooth") {
      // Ensure connected to the configured BT printer
      const { btConnect } = await import("@/features/pos/bluetooth-printer");
      if (settings?.printerAddress) {
        await btConnect(settings.printerAddress);
      }
      await btSend(raw);
    } else {
      console.warn("[Sync] Main device has no printer configured, cannot forward print job");
      return;
    }
    console.log(`[Sync] Print job forwarded to ${conn} printer`);
  } catch (e) {
    console.error("[Sync] Failed to forward print job:", e);
    throw e;
  }
}

/** Save/update a synced work period — Sub work periods are stored but Main uses its own for reports */
async function handleWorkPeriodSync(wp: WorkPeriod): Promise<void> {
  // Don't save Sub's work periods — they'd clutter Main's work period dropdown
  // Sub orders/expenses are already remapped to Main's active work period
  console.log(`[Sync] Work period sync from Sub ignored (Main uses its own work periods)`);
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
