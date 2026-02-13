/**
 * SyncProvider — React context that manages the sync state globally.
 * 
 * - Tracks device role (main/sub/none) and connection status
 * - On Main: starts server and listens for incoming data
 * - On Sub: auto-reconnects on mount if previously connected
 * - Provides helpers for syncing orders, expenses, print jobs
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { DeviceRole, ConnectionStatus, SyncConfig } from "./sync-types";
import { DEFAULT_SYNC_CONFIG, DEFAULT_SYNC_PORT } from "./sync-types";
import {
  startSyncServer,
  stopSyncServer,
  getSyncServerStatus,
  onSyncDataReceived,
  isNativeAndroid,
} from "./local-sync-server";
import { setMainAppUrl, pingMainApp, sendToMainApp, sendPrintJob } from "./sync-client";
import { handleSyncData } from "./sync-handler";
import type { Order, Expense, TableOrder } from "@/db/schema";
import type { SyncEndpoint } from "./sync-types";

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
  isSubConnected: false,
});

export const useSync = () => useContext(SyncContext);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<DeviceRole>("none");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const deviceIdRef = useRef("");
  const initDone = useRef(false);

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
      getSyncServerStatus().then((s) => {
        if (s.running) {
          setStatus("connected");
          // Re-attach listener
          onSyncDataReceived((payload, endpoint) => {
            handleSyncData(payload, endpoint);
          });
        } else {
          startSyncServer(config.port).then(() => {
            setStatus("connected");
            onSyncDataReceived((payload, endpoint) => {
              handleSyncData(payload, endpoint);
            });
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
    }
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
    const res = await sendToMainApp("table-order", tableOrder, deviceIdRef.current);
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

  return (
    <SyncContext.Provider value={{ role, status, syncOrder, syncTableOrder, syncExpense, syncCreditPayment, syncPrintJob, isSubConnected }}>
      {children}
    </SyncContext.Provider>
  );
}
