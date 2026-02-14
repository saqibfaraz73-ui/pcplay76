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

/** Save a synced order into the Main device's database, overriding workPeriodId with Main's active WP */
async function handleOrderSync(order: Order): Promise<void> {
  // Check if order already exists (avoid duplicates)
  const existing = await db.orders.get(order.id);
  if (existing) {
    console.log(`[Sync] Order ${order.id} already exists, skipping`);
    return;
  }
  // Override workPeriodId with Main's active work period so it appears in Main's reports
  const activeWp = await db.workPeriods.filter((wp) => !wp.isClosed).first();
  if (activeWp) {
    order.workPeriodId = activeWp.id;
  }
  await db.orders.put(order);
  console.log(`[Sync] Order ${order.id} saved (receipt #${order.receiptNo}, wp: ${order.workPeriodId})`);
}

/** Save a synced table order, overriding workPeriodId with Main's active WP */
async function handleTableOrderSync(tableOrder: TableOrder): Promise<void> {
  const existing = await db.tableOrders.get(tableOrder.id);
  if (existing) {
    // Update if newer
    if (tableOrder.updatedAt > existing.updatedAt) {
      // Override workPeriodId with Main's active WP
      const activeWp = await db.workPeriods.filter((wp) => !wp.isClosed).first();
      if (activeWp) tableOrder.workPeriodId = activeWp.id;
      await db.tableOrders.put(tableOrder);
      console.log(`[Sync] Table order ${tableOrder.id} updated`);
    }
    return;
  }
  // Override workPeriodId with Main's active WP
  const activeWp = await db.workPeriods.filter((wp) => !wp.isClosed).first();
  if (activeWp) tableOrder.workPeriodId = activeWp.id;
  await db.tableOrders.put(tableOrder);
  console.log(`[Sync] Table order ${tableOrder.id} saved`);
}

/** Save a synced credit payment */
async function handleCreditPaymentSync(data: unknown): Promise<void> {
  const payment = data as { id: string; customerId: string; amount: number; note?: string; createdAt: number };
  const existing = await db.creditPayments.get(payment.id);
  if (existing) return;
  await db.creditPayments.put(payment);
  console.log(`[Sync] Credit payment ${payment.id} saved`);
}

/** Save a synced expense, overriding workPeriodId with Main's active WP */
async function handleExpenseSync(expense: Expense): Promise<void> {
  const existing = await db.expenses.get(expense.id);
  if (existing) return;
  // Override workPeriodId with Main's active WP
  const activeWp = await db.workPeriods.filter((wp) => !wp.isClosed).first();
  if (activeWp) (expense as any).workPeriodId = activeWp.id;
  await db.expenses.put(expense);
  console.log(`[Sync] Expense ${expense.id} saved`);
}

/** Dedup guard: track recent print job hashes to prevent duplicate prints */
const recentPrintJobs = new Map<string, number>();
const PRINT_DEDUP_WINDOW_MS = 5000; // ignore duplicate print data within 5 seconds

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

/** Save/update a synced work period */
async function handleWorkPeriodSync(wp: WorkPeriod): Promise<void> {
  await db.workPeriods.put(wp);
  console.log(`[Sync] Work period ${wp.id} saved (closed: ${wp.isClosed})`);
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
