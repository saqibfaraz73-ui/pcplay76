/**
 * Kitchen Page — Entry point that shows login, then kitchen queue or customer display.
 */
import React, { useState, useEffect } from "react";
import { KitchenLoginPage } from "@/features/kitchen/KitchenLoginPage";
import { KitchenQueueView } from "@/features/kitchen/KitchenQueueView";
import { CustomerDisplayView } from "@/features/kitchen/CustomerDisplayView";
import { setMainAppUrl } from "@/features/sync/sync-client";
import { DEFAULT_SYNC_PORT } from "@/features/sync/sync-types";

type KitchenMode = "login" | "kitchen" | "display";

export default function KitchenPage() {
  const [mode, setMode] = useState<KitchenMode>("login");

  // Restore previous connection on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kitchen_connection");
      if (saved) {
        const { ip, mode: savedMode } = JSON.parse(saved);
        if (ip && savedMode) {
          setMainAppUrl(ip, DEFAULT_SYNC_PORT);
          setMode(savedMode);
        }
      }
    } catch {}
  }, []);

  const handleConnected = (connMode: "kitchen" | "display") => {
    setMode(connMode);
  };

  const handleDisconnect = () => {
    localStorage.removeItem("kitchen_connection");
    setMainAppUrl("", 0);
    setMode("login");
  };

  if (mode === "kitchen") {
    return <KitchenQueueView onDisconnect={handleDisconnect} />;
  }
  if (mode === "display") {
    return <CustomerDisplayView onDisconnect={handleDisconnect} />;
  }
  return <KitchenLoginPage onConnected={handleConnected} />;
}
