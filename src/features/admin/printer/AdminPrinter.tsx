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

const RECEIPT_SIZES: { value: ReceiptSize; label: string }[] = [
  { value: "2x2", label: '2×2 inch' },
  { value: "2x3", label: '2×3 inch' },
];

const RECEIPT_HEIGHT_MAP: Record<ReceiptSize, number> = {
  "2x2": 192,
  "2x3": 288,
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

type PrinterType = "bluetooth" | "usb" | "none";

export function AdminPrinter() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Settings | null>(null);

  // Legacy single-printer (kept for backward compat / sub devices)
  const [connection, setConnection] = React.useState<PrinterType>("none");
  const [printerName, setPrinterName] = React.useState("");
  const [printerAddress, setPrinterAddress] = React.useState("");

  // Dual-printer config
  const [btPrinterAddress, setBtPrinterAddress] = React.useState("");
  const [btPrinterName, setBtPrinterName] = React.useState("");
  const [usbDeviceName, setUsbDeviceName] = React.useState("");
  const [usbPrinterLabel, setUsbPrinterLabel] = React.useState("");

  // Section routing
  const [salesPrinterType, setSalesPrinterType] = React.useState<PrinterType>("none");
  const [tablePrinterType, setTablePrinterType] = React.useState<PrinterType>("none");
  const [printerSections, setPrinterSections] = React.useState<string[]>([]);
  const [sectionPrinterMap, setSectionPrinterMap] = React.useState<Record<string, PrinterType>>({});

  const [receiptSize, setReceiptSize] = React.useState<ReceiptSize>("2x3");
  const [paperSize, setPaperSize] = React.useState<"58" | "80">("58");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [subPrinterMode, setSubPrinterMode] = React.useState<"own" | "main">("own");
  const [subKotOnly, setSubKotOnly] = React.useState(false);

  const [paired, setPaired] = React.useState<PairedBluetoothDevice[]>([]);
  const [btBusy, setBtBusy] = React.useState(false);

  const [usbDevices, setUsbDevices] = React.useState<UsbDevice[]>([]);
  const [usbBusy, setUsbBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    await ensureSeedData();
    const s = await db.settings.get("app");
    if (!s) return;
    setSettings(s);
    setConnection(s.printerConnection ?? "none");
    setPrinterName(s.printerName ?? "");
    setPrinterAddress(s.printerAddress ?? "");
    setBtPrinterAddress(s.btPrinterAddress ?? "");
    setBtPrinterName(s.btPrinterName ?? "");
    setUsbDeviceName(s.usbDeviceName ?? "");
    setUsbPrinterLabel(s.usbPrinterLabel ?? "");
    setSalesPrinterType(s.salesPrinterType ?? s.printerConnection ?? "none");
    setTablePrinterType(s.tablePrinterType ?? s.printerConnection ?? "none");
    setPrinterSections(s.printerSections ?? []);
    setSectionPrinterMap(s.sectionPrinterMap ?? {});
    setReceiptSize(s.receiptSize ?? "2x3");
    setPaperSize(s.paperSize ?? "58");
    setSubPrinterMode(s.subPrinterMode ?? "own");
    setSubKotOnly(s.subKotOnly ?? false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Derive which printers are configured
  const hasBt = !!btPrinterAddress.trim();
  const hasUsb = !!usbDeviceName.trim();

  // Auto-set legacy connection field for backward compat
  const derivedConnection: PrinterType = hasBt && hasUsb ? "usb" : hasBt ? "bluetooth" : hasUsb ? "usb" : "none";

  const save = async () => {
    try {
      if (!settings) throw new Error("Settings not loaded.");
      const next: Settings = {
        ...settings,
        // Legacy fields — derived from dual config
        printerConnection: derivedConnection,
        printerName: btPrinterName.trim() || usbPrinterLabel.trim() || undefined,
        printerAddress: btPrinterAddress.trim() || usbDeviceName.trim() || undefined,
        // Dual-printer fields
        btPrinterAddress: btPrinterAddress.trim() || undefined,
        btPrinterName: btPrinterName.trim() || undefined,
        usbDeviceName: usbDeviceName.trim() || undefined,
        usbPrinterLabel: usbPrinterLabel.trim() || undefined,
        // Section routing
        salesPrinterType,
        tablePrinterType,
        // Custom section routing
        printerSections,
        sectionPrinterMap,
        receiptSize,
        paperSize,
        subPrinterMode,
        subKotOnly,
        updatedAt: Date.now(),
      };
      await db.settings.put(next);
      toast({ title: "Saved" });
      setSettings(next);
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // ---- Bluetooth handlers ----
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

  const connectBt = async () => {
    if (!btPrinterAddress.trim()) {
      toast({ title: "Select a printer", description: "Choose a paired Bluetooth device first.", variant: "destructive" });
      return;
    }
    setBtBusy(true);
    try {
      await btInitialize();
      await btEnable();
      await btConnect(btPrinterAddress.trim());
      toast({ title: "Bluetooth printer connected" });
    } catch (e: any) {
      toast({ title: "Could not connect", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBtBusy(false);
    }
  };

  const disconnectBt = async () => {
    setBtBusy(true);
    try {
      await btDisconnect();
      toast({ title: "Bluetooth printer disconnected" });
    } catch (e: any) {
      toast({ title: "Could not disconnect", description: e?.message ?? String(e), variant: "destructive" });
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
    if (!usbDeviceName.trim()) {
      toast({ title: "Select a printer", description: "Choose a USB device first.", variant: "destructive" });
      return;
    }
    setUsbBusy(true);
    try {
      await usbConnect(usbDeviceName.trim());
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

  // Available printer options for section routing
  const sectionOptions: { value: PrinterType; label: string }[] = [
    { value: "none", label: "None (No Printing)" },
    { value: "bluetooth", label: `Bluetooth${hasBt ? ` (${btPrinterName || btPrinterAddress})` : ""}` },
    { value: "usb", label: `USB${hasUsb ? ` (${usbPrinterLabel || usbDeviceName})` : ""}` },
  ];

  return (
    <div className="space-y-4">
      {/* ── Bluetooth Printer ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Bluetooth Printer
            {hasBt && <Badge variant="outline" className="text-xs">Configured</Badge>}
          </CardTitle>
          <CardDescription>
            Pair the printer in Android Bluetooth settings first, then select it here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Printer name (optional)</Label>
            <input
              value={btPrinterName}
              onChange={(e) => setBtPrinterName(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="e.g. XP-58 Bluetooth"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {isNativeAndroid()
                ? "Select a paired device, then connect."
                : "Bluetooth works only in the installed Android app."}
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadPaired()} disabled={btBusy}>
              Refresh paired devices
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Paired devices</Label>
            <select
              value={btPrinterAddress}
              onChange={(e) => setBtPrinterAddress(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Select printer…</option>
              {paired.map((d) => (
                <option key={d.address} value={d.address}>
                  {(d.name ?? "(Unnamed)") + " — " + d.address}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void connectBt()} disabled={btBusy || !isNativeAndroid()}>
              Connect
            </Button>
            <Button variant="outline" size="sm" onClick={() => void disconnectBt()} disabled={btBusy || !isNativeAndroid()}>
              Disconnect
            </Button>
            <Button size="sm" variant="default" onClick={() => void save()} disabled={!settings}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── USB Printer ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            USB OTG Printer
            {hasUsb && <Badge variant="outline" className="text-xs">Configured</Badge>}
          </CardTitle>
          <CardDescription>
            Connect a thermal printer via USB OTG cable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Printer label (optional)</Label>
            <input
              value={usbPrinterLabel}
              onChange={(e) => setUsbPrinterLabel(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="e.g. XP-58 USB"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {isNativeAndroid()
                ? "Connect via OTG cable, then tap Refresh."
                : "USB OTG works only in the installed Android app."}
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadUsbDevices()} disabled={usbBusy}>
              Refresh USB devices
            </Button>
          </div>

          <div className="space-y-2">
            <Label>USB Devices</Label>
            <select
              value={usbDeviceName}
              onChange={(e) => setUsbDeviceName(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Select printer…</option>
              {usbDevices.map((d) => (
                <option key={d.deviceName} value={d.deviceName}>
                  {(d.productName || d.manufacturerName || "USB Printer") + ` (${d.vendorId}:${d.productId})`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void connectUsb()} disabled={usbBusy || !isNativeAndroid()}>
              Connect
            </Button>
            <Button variant="outline" size="sm" onClick={() => void disconnectUsb()} disabled={usbBusy || !isNativeAndroid()}>
              Disconnect
            </Button>
            <Button size="sm" variant="default" onClick={() => void save()} disabled={!settings}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section Routing ── */}
      <Card>
        <CardHeader>
          <CardTitle>Printer Assignment</CardTitle>
          <CardDescription>
            Choose which printer to use for each section. Assign categories to sections in Admin &gt; Products.
            Legacy "Sales" and "Tables" sections are always available as fallback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Legacy sales/tables routing */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="salesPrinter">Sales Dashboard (default)</Label>
              <select
                id="salesPrinter"
                value={salesPrinterType}
                onChange={(e) => setSalesPrinterType(e.target.value as PrinterType)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {sectionOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tablePrinter">Table Management (default)</Label>
              <select
                id="tablePrinter"
                value={tablePrinterType}
                onChange={(e) => setTablePrinterType(e.target.value as PrinterType)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {sectionOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom printer sections */}
          {printerSections.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              <Label className="text-sm font-medium">Custom Sections</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {printerSections.map((sec) => (
                  <div key={sec} className="space-y-2">
                    <Label htmlFor={`section-${sec}`}>Section: {sec}</Label>
                    <select
                      id={`section-${sec}`}
                      value={sectionPrinterMap[sec] ?? "none"}
                      onChange={(e) => setSectionPrinterMap((prev) => ({ ...prev, [sec]: e.target.value as PrinterType }))}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      {sectionOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasBt && !hasUsb && (
            <p className="text-xs text-muted-foreground">
              Configure at least one printer above to assign it to a section.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Receipt Settings ── */}
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

          <div className="flex items-center gap-3">
            <Switch
              id="subPrinterMode"
              checked={subPrinterMode === "main"}
              onCheckedChange={(v) => setSubPrinterMode(v ? "main" : "own")}
            />
            <Label htmlFor="subPrinterMode" className="text-sm">
              Sub device: use Main device's printer (instead of own)
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="subKotOnly"
              checked={subKotOnly}
              onCheckedChange={(v) => setSubKotOnly(v)}
            />
            <Label htmlFor="subKotOnly" className="text-sm">
              Sub app: KOT only mode (waiter prints KOT, saves sale — admin/cashier prints receipt from Recent Orders on main app)
            </Label>
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
                width: 192,
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
