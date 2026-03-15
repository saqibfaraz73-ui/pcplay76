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
export async function pingIp(ip: string, port = DEFAULT_SYNC_PORT, timeoutMs = 1200): Promise<boolean> {
  const url = `http://${ip}:${port}/ping`;
  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      signal: AbortSignal.timeout(timeoutMs),
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

/** Verify connection PIN with the Main device via GET bridge. Returns true if PIN is correct or no PIN is set. */
export async function verifyPinWithMain(pin: string): Promise<{ ok: boolean; error?: string }> {
  if (!mainAppUrl) return { ok: false, error: "Not connected" };
  try {
    const url = `${mainAppUrl}/get/verify-pin?pin=${encodeURIComponent(pin)}`;
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    return { ok: !!json.ok, error: json.error };
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error" };
  }
}

/** Common hotspot/router gateway IPs to try first (highest priority) */
const PRIORITY_IPS = [
  "192.168.43.1",   // Android hotspot default
  "192.168.1.1",    // Common router
  "192.168.0.1",    // Common router
  "192.168.49.1",   // Wi-Fi Direct
  "172.20.10.1",    // iPhone hotspot
  "192.168.137.1",  // Windows hotspot
  "192.168.8.1",    // Huawei hotspot
  "192.168.31.1",   // Xiaomi routers
  "10.0.0.1",       // Some routers
  "192.168.2.1",    // Some routers
  "192.168.4.1",    // Some routers
  "192.168.100.1",  // Some ISP routers
  "192.168.10.1",   // Some routers
];

/** Try to detect the device's own subnet from the Main server status or common patterns */
function guessSubnets(): string[] {
  const subnets: string[] = [];
  // Android hotspot subnet
  subnets.push("192.168.43");
  // Common home/office subnets
  subnets.push("192.168.1");
  subnets.push("192.168.0");
  // Wi-Fi Direct
  subnets.push("192.168.49");
  // Xiaomi
  subnets.push("192.168.31");
  // 10.x
  subnets.push("10.0.0");
  return subnets;
}

/** Scan to find the Main device — fast priority scan first, then broader sweep */
export async function scanForMainDevice(
  port = DEFAULT_SYNC_PORT,
  onProgress?: (checked: number, total: number) => void
): Promise<string | null> {
  // Phase 1: Quick scan of priority IPs (very fast, ~1.2s)
  const priorityResults = await Promise.all(
    PRIORITY_IPS.map(async (ip) => {
      const ok = await pingIp(ip, port, 1200);
      return ok ? ip : null;
    })
  );
  const priorityFound = priorityResults.find((r) => r !== null);
  if (priorityFound) {
    onProgress?.(1, 1);
    return priorityFound;
  }

  // Phase 2: Scan subnets .2 to .30 in parallel batches of 30
  const subnets = guessSubnets();
  const ipsToScan: string[] = [];
  for (const subnet of subnets) {
    for (let i = 2; i <= 30; i++) {
      const ip = `${subnet}.${i}`;
      if (!PRIORITY_IPS.includes(ip)) {
        ipsToScan.push(ip);
      }
    }
  }

  const total = ipsToScan.length;
  let checked = 0;
  const BATCH = 30;

  for (let i = 0; i < ipsToScan.length; i += BATCH) {
    const batch = ipsToScan.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (ip) => {
        const ok = await pingIp(ip, port, 1200);
        checked++;
        onProgress?.(checked, total);
        return ok ? ip : null;
      })
    );
    const found = results.find((r) => r !== null);
    if (found) return found;
  }

  // Phase 3: Extended range .31 to .60 (less common)
  const extendedIps: string[] = [];
  for (const subnet of subnets) {
    for (let i = 31; i <= 60; i++) {
      extendedIps.push(`${subnet}.${i}`);
    }
  }

  for (let i = 0; i < extendedIps.length; i += BATCH) {
    const batch = extendedIps.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (ip) => {
        const ok = await pingIp(ip, port, 1200);
        checked++;
        onProgress?.(checked, total + extendedIps.length);
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
  sourceDeviceId: string,
  section?: string
): Promise<SyncResponse> {
  const job: PrintJobPayload = { printData, printerType, section };
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
