/**
 * Local Sync Server — TypeScript bridge to native LocalSyncServer Capacitor plugin.
 *
 * Used by the MAIN device to start/stop the local HTTP server
 * that Sub devices connect to over hotspot/WiFi.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type { SyncPayload } from "./sync-types";

interface LocalSyncServerPlugin {
  startServer(options?: { port?: number }): Promise<{
    success: boolean;
    address: string;
    port: number;
  }>;
  stopServer(): Promise<{ success: boolean }>;
  getStatus(): Promise<{
    running: boolean;
    address: string;
    port: number;
  }>;
  getLastSyncData(): Promise<{
    data: string;
    endpoint: string;
    timestamp: number;
  }>;
  addListener(
    eventName: "syncDataReceived",
    handler: (event: { endpoint: string; data: string; timestamp: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "syncQueryReceived",
    handler: (event: { endpoint: string; requestId: string }) => void
  ): Promise<PluginListenerHandle>;
  respondToQuery(options: { requestId: string; data: string }): Promise<void>;
}

const LocalSyncServer = registerPlugin<LocalSyncServerPlugin>("LocalSyncServer");

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** Start the local HTTP server on the Main device */
export async function startSyncServer(port = 8942) {
  if (!isNativeAndroid()) {
    throw new Error("Local sync server requires the Android app.");
  }
  return LocalSyncServer.startServer({ port });
}

/** Stop the local HTTP server */
export async function stopSyncServer() {
  if (!isNativeAndroid()) return { success: true };
  return LocalSyncServer.stopServer();
}

/** Check if server is running and get IP/port */
export async function getSyncServerStatus() {
  if (!isNativeAndroid()) {
    return { running: false, address: "0.0.0.0", port: 8942 };
  }
  return LocalSyncServer.getStatus();
}

/**
 * Listen for incoming sync data from Sub devices.
 * The callback receives parsed SyncPayload objects.
 */
export async function onSyncDataReceived(
  callback: (payload: SyncPayload, endpoint: string) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) return null;

  return LocalSyncServer.addListener("syncDataReceived", (event) => {
    try {
      const parsed = JSON.parse(event.data) as SyncPayload;
      callback(parsed, event.endpoint);
    } catch (e) {
      console.error("Failed to parse sync data:", e);
    }
  });
}

/**
 * Listen for incoming GET query requests from Sub/Kitchen devices.
 * The callback should return data to respond with.
 */
export async function onSyncQueryReceived(
  callback: (endpoint: string) => Promise<unknown>
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) return null;

  return LocalSyncServer.addListener("syncQueryReceived", async (event) => {
    try {
      const data = await callback(event.endpoint);
      await LocalSyncServer.respondToQuery({
        requestId: event.requestId,
        data: JSON.stringify(data),
      });
    } catch (e) {
      console.error("Failed to handle sync query:", e);
      await LocalSyncServer.respondToQuery({
        requestId: event.requestId,
        data: JSON.stringify({ error: "Internal error" }),
      });
    }
  });
}
