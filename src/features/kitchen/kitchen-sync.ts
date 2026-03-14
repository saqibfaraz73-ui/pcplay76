/**
 * Kitchen Sync — Handles polling kitchen orders from Main device
 * and sending status updates back.
 */
import type { KitchenOrder, KitchenOrderStatus } from "@/db/kitchen-schema";
import { getMainAppUrl } from "@/features/sync/sync-client";

/** Fetch all kitchen orders from Main device */
export async function fetchKitchenOrders(): Promise<KitchenOrder[]> {
  const url = getMainAppUrl();
  if (!url) return [];
  try {
    const res = await fetch(`${url}/sync/kitchen-orders`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.orders ?? [];
  } catch {
    return [];
  }
}

/** Send a kitchen status update back to Main */
export async function sendKitchenStatusUpdate(
  orderId: string,
  status: KitchenOrderStatus,
  sourceDeviceId: string
): Promise<boolean> {
  const url = getMainAppUrl();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/sync/kitchen-status-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "kitchen-status-update",
        data: { orderId, status, updatedAt: Date.now() },
        sourceDeviceId,
        sentAt: Date.now(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch kitchen orders for customer display (read-only, only pending/preparing/ready) */
export async function fetchKitchenDisplay(): Promise<KitchenOrder[]> {
  const url = getMainAppUrl();
  if (!url) return [];
  try {
    const res = await fetch(`${url}/sync/kitchen-display`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.orders ?? [];
  } catch {
    return [];
  }
}
