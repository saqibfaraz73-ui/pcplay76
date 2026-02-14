/**
 * Sync Client — Used by SUB devices to send data to the Main app.
 *
 * Sends HTTP requests to the Main device's local server over WiFi/hotspot.
 */
import type {
  SyncEndpoint,
  SyncPayload,
  SyncResponse,
  PrintJobPayload,
  BulkSyncPayload,
} from "./sync-types";
import { DEFAULT_SYNC_PORT } from "./sync-types";

let mainAppUrl = "";

/** Configure the Main app URL (called once when connecting) */
export function setMainAppUrl(ip: string, port = DEFAULT_SYNC_PORT) {
  mainAppUrl = `http://${ip}:${port}`;
}

export function getMainAppUrl() {
  return mainAppUrl;
}

/** Ping the Main app to check if it's reachable */
export async function pingMainApp(): Promise<boolean> {
  if (!mainAppUrl) {
    console.error("[Sync] pingMainApp: No mainAppUrl set");
    return false;
  }
  const url = `${mainAppUrl}/ping`;
  console.log("[Sync] Pinging Main app at:", url);
  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      signal: AbortSignal.timeout(8000),
    });
    console.log("[Sync] Ping response status:", res.status);
    if (!res.ok) return false;
    const json = await res.json();
    console.log("[Sync] Ping response body:", JSON.stringify(json));
    return json.status === "ok" && json.role === "main";
  } catch (e: any) {
    console.error("[Sync] Ping failed:", e?.message || e, "URL was:", url);
    return false;
  }
}

/** Send a single sync payload to the Main app */
export async function sendToMainApp(
  endpoint: SyncEndpoint,
  data: unknown,
  sourceDeviceId: string
): Promise<SyncResponse> {
  if (!mainAppUrl) {
    return { success: false, error: "Not connected to Main app" };
  }

  const payload: SyncPayload = {
    endpoint,
    data,
    sourceDeviceId,
    sentAt: Date.now(),
  };

  try {
    const res = await fetch(`${mainAppUrl}/sync/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return (await res.json()) as SyncResponse;
  } catch (e: any) {
    return { success: false, error: e.message || "Network error" };
  }
}

/** Send a print job to the Main app's printer */
export async function sendPrintJob(
  printData: string,
  printerType: "bluetooth" | "usb",
  sourceDeviceId: string
): Promise<SyncResponse> {
  const job: PrintJobPayload = { printData, printerType };
  return sendToMainApp("print", job, sourceDeviceId);
}

/** Send multiple items in a single request */
export async function sendBulkSync(
  items: Array<{ endpoint: SyncEndpoint; data: unknown }>,
  sourceDeviceId: string
): Promise<SyncResponse> {
  if (!mainAppUrl) {
    return { success: false, error: "Not connected to Main app" };
  }

  const payload: BulkSyncPayload = {
    endpoint: "bulk",
    items,
    sourceDeviceId,
    sentAt: Date.now(),
  };

  try {
    const res = await fetch(`${mainAppUrl}/sync/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return (await res.json()) as SyncResponse;
  } catch (e: any) {
    return { success: false, error: e.message || "Network error" };
  }
}
