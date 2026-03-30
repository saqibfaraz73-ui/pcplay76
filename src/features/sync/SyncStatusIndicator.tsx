/**
 * SyncStatusIndicator — Small icon in the navbar showing sync connection status.
 * For Main: also shows count of connected sub devices.
 */
import React from "react";
import { Wifi, WifiOff, Server, Smartphone } from "lucide-react";
import { useSync } from "./SyncProvider";
import { getConnectedSubDeviceCount } from "./sync-handler";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SyncStatusIndicator() {
  const { role, status } = useSync();
  const [subCount, setSubCount] = React.useState(0);

  React.useEffect(() => {
    if (role !== "main") return;
    const refresh = () => setSubCount(getConnectedSubDeviceCount());
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, [role]);

  if (role === "none") return null;

  const isConnected = status === "connected";
  const isMain = role === "main";

  const label = isMain
    ? isConnected ? `Main: Server running (${subCount} sub${subCount !== 1 ? "s" : ""})` : "Main: Server stopped"
    : isConnected ? "Sub: Connected to Main" : "Sub: Disconnected";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 px-2 py-1 rounded-md border bg-muted/50">
          {isMain ? (
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {isConnected ? (
            <Wifi className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-destructive" />
          )}
          {isMain && isConnected && subCount > 0 && (
            <span className="text-[10px] font-bold text-green-700 ml-0.5">{subCount}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
