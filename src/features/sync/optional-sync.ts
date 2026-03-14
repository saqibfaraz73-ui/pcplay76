/**
 * Optional Sync — Helpers for sending optional data (expenses, party lodge, advance booking)
 * from Sub device to Main device when the respective sync toggle is enabled.
 */
import { getSyncConfig } from "./sync-utils";
import { sendToMainApp } from "./sync-client";
import type { SyncEndpoint } from "./sync-types";

async function getDeviceId(): Promise<string> {
  const { getLicense } = await import("@/features/licensing/licensing-db");
  const lic = await getLicense();
  return lic.deviceId;
}

function isSubConnected(): boolean {
  const config = getSyncConfig();
  return config.role === "sub" && !!config.mainAppIp;
}

/** Send expense to Main if syncExpenses is enabled */
export async function syncExpenseOptional(expense: unknown): Promise<void> {
  const config = getSyncConfig();
  if (!isSubConnected() || !config.syncExpenses) return;
  try {
    const deviceId = await getDeviceId();
    const res = await sendToMainApp("expense", expense, deviceId);
    if (!res.success) console.warn("[Sync] Failed to sync expense:", res.error);
  } catch (e) {
    console.warn("[Sync] Expense sync error:", e);
  }
}

/** Send supplier arrival to Main if syncPartyLodge is enabled */
export async function syncPartyArrivalOptional(supplier: unknown, arrival: unknown): Promise<void> {
  const config = getSyncConfig();
  if (!isSubConnected() || !config.syncPartyLodge) return;
  try {
    const deviceId = await getDeviceId();
    const res = await sendToMainApp("party-lodge-arrival" as SyncEndpoint, { supplier, arrival }, deviceId);
    if (!res.success) console.warn("[Sync] Failed to sync arrival:", res.error);
  } catch (e) {
    console.warn("[Sync] Party arrival sync error:", e);
  }
}

/** Send supplier payment to Main if syncPartyLodge is enabled */
export async function syncPartyPaymentOptional(supplier: unknown, payment: unknown, expense?: unknown): Promise<void> {
  const config = getSyncConfig();
  if (!isSubConnected() || !config.syncPartyLodge) return;
  try {
    const deviceId = await getDeviceId();
    const res = await sendToMainApp("party-lodge-payment" as SyncEndpoint, { supplier, payment, expense }, deviceId);
    if (!res.success) console.warn("[Sync] Failed to sync payment:", res.error);
  } catch (e) {
    console.warn("[Sync] Party payment sync error:", e);
  }
}

/** Send advance order to Main if syncAdvanceBooking is enabled */
export async function syncAdvanceOrderOptional(order: unknown): Promise<void> {
  const config = getSyncConfig();
  if (!isSubConnected() || !config.syncAdvanceBooking) return;
  try {
    const deviceId = await getDeviceId();
    const res = await sendToMainApp("advance-order" as SyncEndpoint, order, deviceId);
    if (!res.success) console.warn("[Sync] Failed to sync advance order:", res.error);
  } catch (e) {
    console.warn("[Sync] Advance order sync error:", e);
  }
}

/** Send booking order to Main if syncAdvanceBooking is enabled */
export async function syncBookingOrderOptional(order: unknown): Promise<void> {
  const config = getSyncConfig();
  if (!isSubConnected() || !config.syncAdvanceBooking) return;
  try {
    const deviceId = await getDeviceId();
    const res = await sendToMainApp("booking-order" as SyncEndpoint, order, deviceId);
    if (!res.success) console.warn("[Sync] Failed to sync booking order:", res.error);
  } catch (e) {
    console.warn("[Sync] Booking order sync error:", e);
  }
}
