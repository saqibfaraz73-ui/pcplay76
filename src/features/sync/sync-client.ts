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

/** Ping a specific IP to check if Main app is running there */
export async function pingIp(ip: string, port = DEFAULT_SYNC_PORT): Promise<boolean> {
  const url = `http://${ip}:${port}/ping`;
  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.status === "ok" && json.role === "main";
  } catch {
    return false;
  }
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

/** Common hotspot/router gateway IPs to scan */
const COMMON_IPS = [
  "192.168.43.1",   // Android hotspot default
  "192.168.1.1",    // Common router
  "192.168.0.1",    // Common router
  "192.168.49.1",   // Wi-Fi Direct
  "10.0.0.1",       // Some routers
  "172.20.10.1",    // iPhone hotspot
  "192.168.137.1",  // Windows hotspot
  "192.168.2.1",    // Some routers
  "10.0.0.138",     // Some configurations
  "192.168.8.1",    // Huawei hotspot
];

/** Scan common IPs + a subnet range to find the Main device */
export async function scanForMainDevice(
  port = DEFAULT_SYNC_PORT,
  onProgress?: (checked: number, total: number) => void
): Promise<string | null> {
  // Build list: common IPs + 192.168.43.x range (1-20)
  const ipsToScan = new Set(COMMON_IPS);
  for (let i = 1; i <= 20; i++) ipsToScan.add(`192.168.43.${i}`);
  for (let i = 1; i <= 20; i++) ipsToScan.add(`192.168.1.${i}`);
  for (let i = 1; i <= 10; i++) ipsToScan.add(`192.168.0.${i}`);

  const allIps = Array.from(ipsToScan);
  const total = allIps.length;
  let checked = 0;

  // Scan in batches of 10 for speed
  const BATCH = 10;
  for (let i = 0; i < allIps.length; i += BATCH) {
    const batch = allIps.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (ip) => {
        const ok = await pingIp(ip, port);
        checked++;
        onProgress?.(checked, total);
        return ok ? ip : null;
      })
    );
    const found = results.find((r) => r !== null);
    if (found) return found;
  }
  return null;
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
