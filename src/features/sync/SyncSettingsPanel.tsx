/**
 * Sync Settings Panel — UI for configuring Main/Sub device role
 * and managing the local P2P connection.
 */
import { useState, useEffect, useCallback } from "react";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { db } from "@/db/appDb";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Wifi, WifiOff, Server, Smartphone, Printer as PrinterIcon, Loader2, QrCode } from "lucide-react";
import { barcodeToDataUrl } from "@/features/labels/barcode-generator";
import type { DeviceRole, ConnectionStatus, SyncConfig } from "./sync-types";
import { DEFAULT_SYNC_CONFIG, DEFAULT_SYNC_PORT } from "./sync-types";
import type { Settings } from "@/db/schema";
import {
  startSyncServer,
  stopSyncServer,
  getSyncServerStatus,
  onSyncDataReceived,
  isNativeAndroid,
} from "./local-sync-server";
import { setMainAppUrl, pingMainApp } from "./sync-client";
import { handleSyncData } from "./sync-handler";

const STORAGE_KEY = "sangi_sync_config";

function loadConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_SYNC_CONFIG;
  } catch {
    return DEFAULT_SYNC_CONFIG;
  }
}

function saveConfig(config: SyncConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function SubPrinterModeContent() {
  const { toast } = useToast();
  const [subPrinterMode, setSubPrinterMode] = React.useState<"own" | "main">("own");
  const [settings, setSettings] = React.useState<Settings | null>(null);

  React.useEffect(() => {
    db.settings.get("app").then((s) => {
      if (s) {
        setSettings(s);
        setSubPrinterMode(s.subPrinterMode ?? "own");
      }
    });
  }, []);

  const savePrinterMode = async (mode: "own" | "main") => {
    if (!settings) return;
    const next: Settings = { ...settings, subPrinterMode: mode, updatedAt: Date.now() };
    await db.settings.put(next);
    setSettings(next);
    setSubPrinterMode(mode);
    toast({ title: "Saved" });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div>
          <div className="text-sm font-medium">Use Main Device's Printer</div>
          <div className="text-xs text-muted-foreground">
            Send all print jobs to the Main device's connected printer instead of printing locally.
          </div>
        </div>
        <Switch
          checked={subPrinterMode === "main"}
          onCheckedChange={(checked) => void savePrinterMode(checked ? "main" : "own")}
        />
      </div>
      {subPrinterMode === "main" && (
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-sm text-muted-foreground">
            ✅ Print jobs will be sent to the Main device over sync. Make sure Main device has a printer connected and sync is active.
          </p>
        </div>
      )}
      {subPrinterMode === "own" && (
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-sm text-muted-foreground">
            🖨️ This device will use its own printer. Configure it in Printer Settings.
          </p>
        </div>
      )}
    </>
  );
}

export function SyncSettingsPanel() {
  const { toast } = useToast();
  const { session } = useAuth();
  const isWaiter = session?.role === "waiter";
  const [waiterMainAppEnabled, setWaiterMainAppEnabled] = useState(false);
  const [config, setConfig] = useState<SyncConfig>(loadConfig);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [serverIp, setServerIp] = useState("");
  const [serverPort, setServerPort] = useState(DEFAULT_SYNC_PORT);
  const [ipInput, setIpInput] = useState(config.mainAppIp ?? "");
  const [pinInput, setPinInput] = useState("");
  const [syncPin, setSyncPin] = useState(config.syncPin ?? "");
  const [loading, setLoading] = useState(false);

  const isAndroid = isNativeAndroid();

  // Load waiter main app permission
  useEffect(() => {
    db.settings.get("app").then((s) => {
      setWaiterMainAppEnabled(!!s?.waiterMainAppEnabled);
    });
  }, []);

  const canBeMain = !isWaiter || waiterMainAppEnabled;

  // Check server status on mount for Main devices
  useEffect(() => {
    if (config.role === "main" && isAndroid) {
      getSyncServerStatus().then((s) => {
        if (s.running) {
          setStatus("connected");
          setServerIp(s.address);
          setServerPort(s.port);
        }
      });
    }
  }, [config.role, isAndroid]);

  // ─── Main: Start Server ──────────────────────────────
  const handleStartServer = useCallback(async () => {
    setLoading(true);
    try {
      const result = await startSyncServer(config.port);
      setServerIp(result.address);
      setServerPort(result.port);
      setStatus("connected");

      // Listen for incoming data
      await onSyncDataReceived((payload, endpoint) => {
        handleSyncData(payload, endpoint);
        toast({
          title: "Data received",
          description: `Synced ${endpoint} from sub device`,
        });
      });

      const newConfig = { ...config, role: "main" as DeviceRole };
      setConfig(newConfig);
      saveConfig(newConfig);

      toast({ title: "Server started", description: `Listening on ${result.address}:${result.port}` });
    } catch (e: any) {
      setStatus("error");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [config, toast]);

  // ─── Main: Stop Server ───────────────────────────────
  const handleStopServer = useCallback(async () => {
    await stopSyncServer();
    setStatus("disconnected");
    const newConfig = { ...config, role: "none" as DeviceRole };
    setConfig(newConfig);
    saveConfig(newConfig);
    toast({ title: "Server stopped" });
  }, [config, toast]);

  // ─── Sub: Connect to Main ────────────────────────────
  const handleConnectToMain = useCallback(async () => {
    const ip = ipInput.trim();
    if (!ip) {
      toast({ title: "Enter Main app IP", variant: "destructive" });
      return;
    }

    // Validate it's a private/local IP
    const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
    if (!isPrivateIp) {
      toast({
        title: "Invalid IP Address",
        description: "Enter a local/private IP (e.g. 192.168.43.1). This should NOT be your mobile data IP. Both devices must be on the same WiFi or hotspot.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setStatus("connecting");
    try {
      setMainAppUrl(ip, config.port);
      const ok = await pingMainApp();
      if (!ok) {
        setStatus("error");
        toast({
          title: "Cannot reach Main app",
          description: "Make sure both devices are on the same WiFi/hotspot and the Main app server is running.",
          variant: "destructive",
        });
        return;
      }
      setStatus("connected");
      const newConfig: SyncConfig = {
        ...config,
        role: "sub",
        mainAppIp: ipInput.trim(),
      };
      setConfig(newConfig);
      saveConfig(newConfig);
      toast({ title: "Connected!", description: `Connected to Main app at ${ipInput}` });
    } catch (e: any) {
      setStatus("error");
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [ipInput, config, toast]);

  // ─── Sub: Disconnect ─────────────────────────────────
  const handleDisconnect = useCallback(() => {
    setMainAppUrl("", 0);
    setStatus("disconnected");
    const newConfig = { ...config, role: "none" as DeviceRole };
    setConfig(newConfig);
    saveConfig(newConfig);
  }, [config]);


  // ─── Reset role ──────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (config.role === "main") await stopSyncServer();
    setMainAppUrl("", 0);
    setStatus("disconnected");
    const newConfig = DEFAULT_SYNC_CONFIG;
    setConfig(newConfig);
    saveConfig(newConfig);
  }, [config]);

  const statusColor: Record<ConnectionStatus, string> = {
    disconnected: "bg-muted text-muted-foreground",
    connecting: "bg-yellow-100 text-yellow-800",
    connected: "bg-green-100 text-green-800",
    error: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-4">
      {/* Status - also show for sub connected */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              {status === "connected" ? <Wifi className="h-5 w-5 text-green-600" /> : <WifiOff className="h-5 w-5" />}
              Device Sync
            </CardTitle>
            <Badge className={statusColor[status]}>{status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {config.role !== "none" && (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                Role: <strong className="text-foreground">{config.role === "main" ? "Main Device" : "Sub Device"}</strong>
              </p>
              {config.role === "main" && status === "connected" && (
                <p>
                  Server IP: <code className="bg-muted px-2 py-0.5 rounded text-foreground font-mono">{serverIp}:{serverPort}</code>
                </p>
              )}
              {config.role === "sub" && config.mainAppIp && (
                <p>
                  Connected to: <code className="bg-muted px-2 py-0.5 rounded text-foreground font-mono">{config.mainAppIp}:{config.port}</code>
                </p>
              )}
            </div>
          )}

          {!isAndroid && (
            <p className="text-sm text-muted-foreground mt-2">
              ⚠️ Device sync requires the Android app build. It won't work in the browser.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Role Selection (when not set) */}
      {config.role === "none" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Choose Device Role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canBeMain && (
              <Button
                className="w-full justify-start gap-3 h-auto py-3 overflow-hidden"
                variant="outline"
                onClick={handleStartServer}
                disabled={loading}
              >
                <Server className="h-5 w-5 shrink-0 text-primary" />
                <div className="text-left min-w-0">
                  <div className="font-medium">Main Device</div>
                  <div className="text-xs text-muted-foreground whitespace-normal break-words">
                    Receives data from sub devices, has the printer
                  </div>
                </div>
                {loading && <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin" />}
              </Button>
            )}

            <Button
              className="w-full justify-start gap-3 h-auto py-3 overflow-hidden"
              variant="outline"
              onClick={() => {
                const newConfig = { ...config, role: "sub" as DeviceRole };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
            >
              <Smartphone className="h-5 w-5 shrink-0 text-primary" />
              <div className="text-left min-w-0">
                <div className="font-medium">Sub Device</div>
                <div className="text-xs text-muted-foreground whitespace-normal break-words">
                  Sends sales data to Main device. Can use its own printer or Main's printer.
                </div>
              </div>
            </Button>

            {isWaiter && !waiterMainAppEnabled && (
              <p className="text-xs text-muted-foreground">
                Waiters can only connect as Sub device. Admin can enable Main device access in Settings.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Device Controls */}
      {config.role === "main" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5" /> Main Device Server
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {status === "connected" ? (
              <>
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">Server is running</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Tell Sub devices to enter this IP: <strong>{serverIp}</strong>
                  </p>
                </div>

                {/* IP Barcode */}
                <div className="flex flex-col items-center gap-2 rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <QrCode className="h-4 w-4" /> Scan IP Barcode
                  </div>
                  <img
                    src={barcodeToDataUrl(`${serverIp}`, { width: 350, height: 70 })}
                    alt={`Barcode: ${serverIp}`}
                    className="max-w-full"
                  />
                  <p className="text-xs text-muted-foreground">Sub device can scan this barcode to get the IP address.</p>
                </div>

                {/* Connection PIN */}
                <div className="space-y-2 rounded-md border p-3">
                  <div className="text-sm font-medium">Connection PIN</div>
                  <p className="text-xs text-muted-foreground">
                    Sub devices must enter this PIN to connect. Leave empty to allow without PIN.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 1234"
                      value={syncPin}
                      onChange={(e) => setSyncPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      maxLength={6}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const next = { ...config, syncPin: syncPin || undefined };
                        setConfig(next);
                        saveConfig(next);
                        toast({ title: syncPin ? "PIN saved" : "PIN removed" });
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <PrinterIcon className="h-4 w-4" />
                  Sub devices can use this device's printer
                </div>
                <Button variant="destructive" size="sm" onClick={handleStopServer}>
                  Stop Server
                </Button>
              </>
            ) : (
              <Button onClick={handleStartServer} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start Server
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sub Device Controls */}
      {config.role === "sub" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Smartphone className="h-5 w-5" /> Sub Device
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {status !== "connected" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="main-ip">Main App IP Address</Label>
                  <Input
                    id="main-ip"
                    placeholder="e.g. 192.168.43.1"
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">Or scan the barcode shown on Main device.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sync-pin">Connection PIN (if set on Main)</Label>
                  <Input
                    id="sync-pin"
                    placeholder="Enter PIN"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    disabled={loading}
                  />
                </div>
                <Button onClick={handleConnectToMain} disabled={loading || !ipInput.trim()}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Connect
                </Button>
              </>
            ) : (
              <>
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">Connected to Main app</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Sales and print jobs will sync to the Main device.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sub Device Printer Mode */}
      {config.role === "sub" && status === "connected" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 min-w-0">
              <PrinterIcon className="h-5 w-5 shrink-0" />
              <span className="truncate">Sub Device Printer</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SubPrinterModeContent />
          </CardContent>
        </Card>
      )}

      {/* Optional Sync Modules (Sub device only) */}
      {config.role === "sub" && status === "connected" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Optional Data Sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enable these to also sync additional data from this Sub device to the Main device.
            </p>

            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Sync Expenses</div>
                <div className="text-xs text-muted-foreground">Send expense records to Main device.</div>
              </div>
              <Switch
                checked={!!config.syncExpenses}
                onCheckedChange={(checked) => {
                  const next = { ...config, syncExpenses: checked };
                  setConfig(next);
                  saveConfig(next);
                  toast({ title: checked ? "Expenses sync enabled" : "Expenses sync disabled" });
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Sync Party Lodge</div>
                <div className="text-xs text-muted-foreground">Send supplier arrivals & payments to Main device.</div>
              </div>
              <Switch
                checked={!!config.syncPartyLodge}
                onCheckedChange={(checked) => {
                  const next = { ...config, syncPartyLodge: checked };
                  setConfig(next);
                  saveConfig(next);
                  toast({ title: checked ? "Party Lodge sync enabled" : "Party Lodge sync disabled" });
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Sync Advance Booking</div>
                <div className="text-xs text-muted-foreground">Send advance orders & bookings to Main device.</div>
              </div>
              <Switch
                checked={!!config.syncAdvanceBooking}
                onCheckedChange={(checked) => {
                  const next = { ...config, syncAdvanceBooking: checked };
                  setConfig(next);
                  saveConfig(next);
                  toast({ title: checked ? "Advance Booking sync enabled" : "Advance Booking sync disabled" });
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reset */}
      {config.role !== "none" && (
        <>
          <Separator />
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset Device Role
          </Button>
        </>
      )}
    </div>
  );
}
