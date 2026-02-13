/**
 * SyncStatusIndicator — Small icon in the navbar showing sync connection status.
 */
import { Wifi, WifiOff, Server, Smartphone } from "lucide-react";
import { useSync } from "./SyncProvider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SyncStatusIndicator() {
  const { role, status } = useSync();

  if (role === "none") return null;

  const isConnected = status === "connected";
  const isMain = role === "main";

  const label = isMain
    ? isConnected ? "Main: Server running" : "Main: Server stopped"
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
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
