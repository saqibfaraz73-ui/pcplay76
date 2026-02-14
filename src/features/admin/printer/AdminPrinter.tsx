import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/appDb";
import type { ReceiptSize, Settings } from "@/db/schema";
import { ensureSeedData } from "@/db/seed";
import { useToast } from "@/hooks/use-toast";
import {
  btConnect,
  btDisconnect,
  btEnable,
  btGetPairedDevices,
  btInitialize,
  isNativeAndroid,
  type PairedBluetoothDevice,
} from "@/features/pos/bluetooth-printer";
import {
  usbListDevices,
  usbConnect,
  usbDisconnect,
  type UsbDevice,
} from "@/features/pos/usb-printer";
import { getSyncConfig } from "@/features/sync/sync-utils";
import { Server } from "lucide-react";

const RECEIPT_SIZES: { value: ReceiptSize; label: string }[] = [
  { value: "1x1", label: '1×1 inch' },
  { value: "2x1", label: '2×1 inch' },
  { value: "3x1", label: '3×1 inch' },
  { value: "2x2", label: '2×2 inch' },
  { value: "2x3", label: '2×3 inch' },
  { value: "2x4", label: '2×4 inch' },
  { value: "2x5", label: '2×5 inch' },
];

// Map receipt size to height in pixels for preview (96 DPI: 1 inch = 96px)
const RECEIPT_HEIGHT_MAP: Record<ReceiptSize, number> = {
  "1x1": 96,   // 1 inch
  "2x1": 96,   // 1 inch
  "3x1": 96,   // 1 inch
  "2x2": 192,  // 2 inches
  "2x3": 288,  // 3 inches
  "2x4": 384,  // 4 inches
  "2x5": 480,  // 5 inches
};

function receiptPreviewText(args: { paperSize: "58" | "80" }) {
  const width = args.paperSize === "58" ? 32 : 48;
  const line = (s: string) => s.slice(0, width).padEnd(width, " ");
  const hr = "-".repeat(width);
  return [
    line("SANGI POS"),
    line("(Receipt Preview)"),
    hr,
    line("Chicken Pizza  x1   1200"),
    line("Cola          x2    400"),
    hr,
    line("Subtotal            1600"),
    line("Discount             100"),
    line("Total               1500"),
    hr,
    line("Thank you!"),
  ].join("\n");
}

export function AdminPrinter() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [connection, setConnection] = React.useState<"none" | "bluetooth" | "usb">("none");
  const [printerName, setPrinterName] = React.useState("");
  const [printerAddress, setPrinterAddress] = React.useState("");
  const [receiptSize, setReceiptSize] = React.useState<ReceiptSize>("2x3");
  const [paperSize, setPaperSize] = React.useState<"58" | "80">("58");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [subPrinterMode, setSubPrinterMode] = React.useState<"own" | "main">("own");
  const [isSubDevice, setIsSubDevice] = React.useState(false);

  const [paired, setPaired] = React.useState<PairedBluetoothDevice[]>([]);
  const [btBusy, setBtBusy] = React.useState(false);

  const [usbDevices, setUsbDevices] = React.useState<UsbDevice[]>([]);
  const [usbBusy, setUsbBusy] = React.useState(false);
  const [selectedUsb, setSelectedUsb] = React.useState("");

  const load = React.useCallback(async () => {
    await ensureSeedData();
    const s = await db.settings.get("app");
    if (!s) return;
    setSettings(s);
    setConnection(s.printerConnection ?? "none");
    setPrinterName(s.printerName ?? "");
    setPrinterAddress(s.printerAddress ?? "");
    setReceiptSize(s.receiptSize ?? "2x3");
    setPaperSize(s.paperSize ?? "58");
    setSubPrinterMode(s.subPrinterMode ?? "own");

    // Check if device is configured as Sub
    const syncConfig = getSyncConfig();
    setIsSubDevice(syncConfig.role === "sub");
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      if (!settings) throw new Error("Settings not loaded.");
      const next: Settings = {
        ...settings,
        printerConnection: connection,
        printerName: printerName.trim() || undefined,
        printerAddress: printerAddress.trim() || undefined,
        receiptSize,
        paperSize,
        subPrinterMode,
        updatedAt: Date.now(),
      };
      await db.settings.put(next);
      toast({ title: "Saved" });
      setSettings(next);
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const loadPaired = async () => {
    setBtBusy(true);
    try {
      await btInitialize();
      await btEnable();
      const devices = await btGetPairedDevices();
      setPaired(devices);
      if (devices.length === 0) {
        toast({
          title: "No paired printers found",
          description: "Pair the printer in Android Bluetooth settings first, then come back and refresh.",
        });
      }
    } catch (e: any) {
      toast({ title: "Bluetooth error", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBtBusy(false);
    }
  };

  const connectSelected = async () => {
    if (!printerAddress.trim()) {
      toast({ title: "Select a printer", description: "Choose a paired device first.", variant: "destructive" });
      return;
    }
    setBtBusy(true);
    try {
      await btInitialize();
      await btEnable();
      await btConnect(printerAddress.trim());
      toast({ title: "Printer connected" });
    } catch (e: any) {
      toast({ title: "Could not connect", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBtBusy(false);
    }
  };

  // ---- USB handlers ----
  const loadUsbDevices = async () => {
    setUsbBusy(true);
    try {
      const devices = await usbListDevices();
      setUsbDevices(devices);
      if (devices.length === 0) {
        toast({ title: "No USB printers found", description: "Connect a printer via USB OTG cable and try again." });
      }
    } catch (e: any) {
      toast({ title: "USB error", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setUsbBusy(false);
    }
  };

  const connectUsb = async () => {
    const dev = selectedUsb || printerAddress;
    if (!dev.trim()) {
      toast({ title: "Select a printer", description: "Choose a USB device first.", variant: "destructive" });
      return;
    }
    setUsbBusy(true);
    try {
      await usbConnect(dev.trim());
      setPrinterAddress(dev.trim());
      toast({ title: "USB printer connected" });
    } catch (e: any) {
      toast({ title: "Could not connect", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setUsbBusy(false);
    }
  };

  const disconnectUsb = async () => {
    setUsbBusy(true);
    try {
      await usbDisconnect();
      toast({ title: "USB printer disconnected" });
    } catch (e: any) {
      toast({ title: "Could not disconnect", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setUsbBusy(false);
    }
  };
  const disconnect = async () => {
    setBtBusy(true);
    try {
      await btDisconnect();
      toast({ title: "Printer disconnected" });
    } catch (e: any) {
      toast({ title: "Could not disconnect", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBtBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub Device Printer Mode */}
      {isSubDevice && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5" /> Sub Device Printer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Use Main Device's Printer</div>
                <div className="text-xs text-muted-foreground">
                  Send all print jobs to the Main device's connected printer instead of printing locally.
                </div>
              </div>
              <Switch
                checked={subPrinterMode === "main"}
                onCheckedChange={(checked) => setSubPrinterMode(checked ? "main" : "own")}
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
                  🖨️ This device will use its own printer configured below.
                </p>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => void save()} disabled={!settings}>Save</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Printer Setup</CardTitle>
          <CardDescription>
            Connect a Bluetooth thermal printer (Android app). For Bluetooth, first pair the printer in Android settings, then select it here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="printerConnection">Connection</Label>
              <select
                id="printerConnection"
                value={connection}
                onChange={(e) => setConnection(e.target.value as any)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="none">None</option>
                <option value="bluetooth">Bluetooth</option>
                <option value="usb">USB (OTG)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="printerName">Printer name (optional)</Label>
              <input
                id="printerName"
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                placeholder="e.g. XP-58"
              />
            </div>
          </div>

          {connection === "bluetooth" ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Bluetooth printer</div>
                  <div className="text-xs text-muted-foreground">
                    {isNativeAndroid()
                      ? "Select a paired device, then connect."
                      : "Bluetooth connection works only inside the installed Android app."}
                  </div>
                </div>
                <Button variant="outline" onClick={() => void loadPaired()} disabled={btBusy || !settings}>
                  Refresh paired devices
                </Button>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="printerAddress">Paired devices</Label>
                <select
                  id="printerAddress"
                  value={printerAddress}
                  onChange={(e) => setPrinterAddress(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Select printer…</option>
                  {paired.map((d) => (
                    <option key={d.address} value={d.address}>
                      {(d.name ?? "(Unnamed)") + " — " + d.address}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-muted-foreground">Tip: If the printer is missing, pair it first in Android Bluetooth settings.</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void connectSelected()} disabled={btBusy || !settings || !isNativeAndroid()}>
                  Connect
                </Button>
                <Button variant="outline" onClick={() => void disconnect()} disabled={btBusy || !settings || !isNativeAndroid()}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : null}

          {connection === "usb" ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">USB OTG Printer</div>
                  <div className="text-xs text-muted-foreground">
                    {isNativeAndroid()
                      ? "Connect a thermal printer via USB OTG cable."
                      : "USB OTG connection works only inside the installed Android app."}
                  </div>
                </div>
                <Button variant="outline" onClick={() => void loadUsbDevices()} disabled={usbBusy || !settings}>
                  Refresh USB devices
                </Button>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="usbDevice">USB Devices</Label>
                <select
                  id="usbDevice"
                  value={selectedUsb}
                  onChange={(e) => setSelectedUsb(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Select printer…</option>
                  {usbDevices.map((d) => (
                    <option key={d.deviceName} value={d.deviceName}>
                      {(d.productName || d.manufacturerName || "USB Printer") + ` (${d.vendorId}:${d.productId})`}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-muted-foreground">Tip: Connect the printer via OTG cable, then tap Refresh.</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void connectUsb()} disabled={usbBusy || !settings || !isNativeAndroid()}>
                  Connect
                </Button>
                <Button variant="outline" onClick={() => void disconnectUsb()} disabled={usbBusy || !settings || !isNativeAndroid()}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt Settings</CardTitle>
          <CardDescription>Configure receipt paper and print size.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="paperSize">Paper width</Label>
              <select
                id="paperSize"
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as any)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="58">58mm</option>
                <option value="80">80mm</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiptSize">Receipt size</Label>
              <select
                id="receiptSize"
                value={receiptSize}
                onChange={(e) => setReceiptSize(e.target.value as any)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {RECEIPT_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!settings}>
              Receipt Preview
            </Button>
            <Button onClick={() => void save()} disabled={!settings}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Receipt Preview ({paperSize}mm • {receiptSize})</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            <div
              className="overflow-hidden rounded border bg-white"
              style={{
                width: 192, // 2 inches at 96 DPI
                height: RECEIPT_HEIGHT_MAP[receiptSize],
              }}
            >
              <pre
                className="p-2 text-black leading-tight overflow-hidden"
                style={{ fontSize: "6px", fontFamily: "monospace" }}
              >
                {receiptPreviewText({ paperSize })}
              </pre>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Width: 2″ (fixed) • Height: {receiptSize.split("x")[1]}″
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
