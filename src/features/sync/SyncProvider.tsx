/**
 * SyncProvider — React context that manages the sync state globally.
 * 
 * - Tracks device role (main/sub/none) and connection status
 * - On Main: starts server and listens for incoming data
 * - On Sub: auto-reconnects on mount if previously connected
 * - Provides helpers for syncing orders, expenses, print jobs
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { db } from "@/db/appDb";
import type { DeviceRole, ConnectionStatus, SyncConfig } from "./sync-types";
import { DEFAULT_SYNC_CONFIG, DEFAULT_SYNC_PORT } from "./sync-types";
import {
  startSyncServer,
  stopSyncServer,
  getSyncServerStatus,
  onSyncDataReceived,
  onSyncGetRequest,
  isNativeAndroid,
} from "./local-sync-server";
import { setMainAppUrl, pingMainApp, sendToMainApp, sendPrintJob } from "./sync-client";
import { handleSyncData } from "./sync-handler";
import type { Order, Expense, TableOrder, WorkPeriod } from "@/db/schema";
import type { SyncEndpoint } from "./sync-types";
import type { PluginListenerHandle } from "@capacitor/core";

const STORAGE_KEY = "sangi_sync_config";

function loadConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_SYNC_CONFIG;
  } catch {
    return DEFAULT_SYNC_CONFIG;
  }
}

type SyncContextValue = {
  role: DeviceRole;
  status: ConnectionStatus;
  /** Sync an order to Main (no-op if not Sub) */
  syncOrder: (order: Order) => Promise<void>;
  /** Sync a table order to Main */
  syncTableOrder: (tableOrder: TableOrder) => Promise<void>;
  /** Sync an expense to Main */
  syncExpense: (expense: Expense) => Promise<void>;
  /** Sync a credit payment to Main */
  syncCreditPayment: (payment: { id: string; customerId: string; amount: number; note?: string; createdAt: number }) => Promise<void>;
  /** Send a print job to Main's printer */
  syncPrintJob: (printData: string, printerType: "bluetooth" | "usb") => Promise<void>;
  /** Sync work period to Main */
  syncWorkPeriod: (wp: WorkPeriod) => Promise<void>;
  /** Whether this device is in Sub mode and connected */
  isSubConnected: boolean;
};

const SyncContext = createContext<SyncContextValue>({
  role: "none",
  status: "disconnected",
  syncOrder: async () => {},
  syncTableOrder: async () => {},
  syncExpense: async () => {},
  syncCreditPayment: async () => {},
  syncPrintJob: async () => {},
  syncWorkPeriod: async () => {},
  isSubConnected: false,
});

export const useSync = () => useContext(SyncContext);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<DeviceRole>("none");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const deviceIdRef = useRef("");
  const initDone = useRef(false);
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenerRef = useRef<PluginListenerHandle | null>(null);

  // Load device ID for sync payloads
  useEffect(() => {
    import("@/features/licensing/licensing-db").then(({ getLicense }) => {
      getLicense().then((lic) => {
        deviceIdRef.current = lic.deviceId;
      });
    });
  }, []);

  // Auto-init on mount
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const config = loadConfig();
    setRole(config.role);

    if (!isNativeAndroid()) return;

    if (config.role === "main") {
      // Auto-start server
      const attachListener = async () => {
        // Remove previous listener to prevent duplicates
        if (listenerRef.current) {
          try { await listenerRef.current.remove(); } catch {}
          listenerRef.current = null;
        }
        const handle = await onSyncDataReceived((payload, endpoint) => {
          handleSyncData(payload, endpoint);
        });
        listenerRef.current = handle;

        // Register kitchen GET query handler so kitchen/customer displays can poll
        try {
          const { getKitchenOrders, getKitchenDisplayOrders } = await import("@/features/kitchen/kitchen-handler");
          await onSyncGetRequest(async (endpoint) => {
            if (endpoint === "kitchen-orders") {
              const orders = await getKitchenOrders();
              return { orders };
            }
            if (endpoint === "kitchen-display") {
              const orders = await getKitchenDisplayOrders();
              return { orders };
            }
            return { error: "Unknown endpoint" };
          });
        } catch (e) {
          console.warn("[Sync] Failed to register kitchen GET handler:", e);
        }
      };

      getSyncServerStatus().then((s) => {
        if (s.running) {
          setStatus("connected");
          attachListener();
        } else {
          startSyncServer(config.port).then(() => {
            setStatus("connected");
            attachListener();
          }).catch(() => setStatus("error"));
        }
      });
    } else if (config.role === "sub" && config.mainAppIp) {
      // Auto-reconnect
      setStatus("connecting");
      setMainAppUrl(config.mainAppIp, config.port);
      pingMainApp().then((ok) => {
        setStatus(ok ? "connected" : "disconnected");
      });

      // Start periodic health check every 8 seconds with auto-reconnect
      healthIntervalRef.current = setInterval(async () => {
        try {
          const ok = await pingMainApp();
          setStatus((prev) => {
            if (ok && prev !== "connected") console.log("[Sync] Reconnected to Main");
            if (!ok && prev === "connected") console.log("[Sync] Lost connection to Main");
            return ok ? "connected" : "disconnected";
          });
        } catch {
          setStatus("disconnected");
        }
      }, 8000);
    }

    return () => {
      if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
      if (listenerRef.current) {
        listenerRef.current.remove().catch(() => {});
        listenerRef.current = null;
      }
    };
  }, []);

  // Listen for config changes from the settings panel
  useEffect(() => {
    const handler = () => {
      const config = loadConfig();
      setRole(config.role);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const isSubConnected = role === "sub" && status === "connected";

  const syncOrder = useCallback(async (order: Order) => {
    if (!isSubConnected) return;
    const res = await sendToMainApp("order", order, deviceIdRef.current);
    if (!res.success) console.warn("[Sync] Failed to sync order:", res.error);
  }, [isSubConnected]);

  const syncTableOrder = useCallback(async (tableOrder: TableOrder) => {
    if (!isSubConnected) return;
    // Enrich with waiter name and table number so Main can display them in reports
    const [waiter, table] = await Promise.all([
      db.waiters.get(tableOrder.waiterId),
      db.restaurantTables.get(tableOrder.tableId),
    ]);
    const enriched = { ...tableOrder, _waiterName: waiter?.name, _tableNumber: table?.tableNumber };
    const res = await sendToMainApp("table-order", enriched, deviceIdRef.current);
    if (!res.success) console.warn("[Sync] Failed to sync table order:", res.error);
  }, [isSubConnected]);

  const syncExpense = useCallback(async (expense: Expense) => {
    if (!isSubConnected) return;
    const res = await sendToMainApp("expense", expense, deviceIdRef.current);
    if (!res.success) console.warn("[Sync] Failed to sync expense:", res.error);
  }, [isSubConnected]);

  const syncCreditPayment = useCallback(async (payment: { id: string; customerId: string; amount: number; note?: string; createdAt: number }) => {
    if (!isSubConnected) return;
    const res = await sendToMainApp("credit-payment", payment, deviceIdRef.current);
    if (!res.success) console.warn("[Sync] Failed to sync credit payment:", res.error);
  }, [isSubConnected]);

  const syncPrintJob = useCallback(async (printData: string, printerType: "bluetooth" | "usb") => {
    if (!isSubConnected) return;
    const res = await sendPrintJob(printData, printerType, deviceIdRef.current);
    if (!res.success) console.warn("[Sync] Failed to sync print job:", res.error);
  }, [isSubConnected]);

  const syncWorkPeriod = useCallback(async (wp: WorkPeriod) => {
    if (!isSubConnected) return;
    const res = await sendToMainApp("work-period", wp, deviceIdRef.current);
    if (!res.success) console.warn("[Sync] Failed to sync work period:", res.error);
  }, [isSubConnected]);

  return (
    <SyncContext.Provider value={{ role, status, syncOrder, syncTableOrder, syncExpense, syncCreditPayment, syncPrintJob, syncWorkPeriod, isSubConnected }}>
      {children}
    </SyncContext.Provider>
  );
}
