import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/appDb";
import type { ReceiptSize, Settings } from "@/db/schema";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
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
import {
  netTestConnection,
  netConnect,
  netDisconnect,
} from "@/features/pos/network-printer";

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

type PrinterType = "bluetooth" | "usb" | "network" | "none";
type LabelLanguage = "zpl" | "tspl" | "escpos";
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

  // Default printer & section routing
  const [defaultPrinterType, setDefaultPrinterType] = React.useState<PrinterType>("none");
  const [kotPrinterType, setKotPrinterType] = React.useState<PrinterType>("none");
  const [salesDashboardPrinterType, setSalesDashboardPrinterType] = React.useState<PrinterType>("none");
  const [printerSections, setPrinterSections] = React.useState<string[]>([]);
  const [sectionPrinterMap, setSectionPrinterMap] = React.useState<Record<string, PrinterType>>({});

  // Dedicated label printer
  const [labelPrinterType, setLabelPrinterType] = React.useState<PrinterType>("none");
  const [labelPrinterLanguage, setLabelPrinterLanguage] = React.useState<LabelLanguage>("escpos");
  const [labelBtAddress, setLabelBtAddress] = React.useState("");
  const [labelBtName, setLabelBtName] = React.useState("");
  const [labelUsbDevice, setLabelUsbDevice] = React.useState("");
  const [labelUsbLabel, setLabelUsbLabel] = React.useState("");

  const [receiptSize, setReceiptSize] = React.useState<ReceiptSize>("2x3");
  const [paperSize, setPaperSize] = React.useState<"58" | "80">("58");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [subPrinterMode, setSubPrinterMode] = React.useState<"own" | "main">("own");
  const [subKotOnly, setSubKotOnly] = React.useState(false);

  // Receipt content settings (moved from AdminSettings)
  const [receiptLogoPath, setReceiptLogoPath] = React.useState<string | undefined>();
  const [showLogo, setShowLogo] = React.useState(false);
  const [showAddress, setShowAddress] = React.useState(false);
  const [showPhone, setShowPhone] = React.useState(false);
  const [showBusinessName, setShowBusinessName] = React.useState(true);
  const [receiptQrEnabled, setReceiptQrEnabled] = React.useState(false);
  const [posAutoPrintReceipt, setPosAutoPrintReceipt] = React.useState(false);
  const [receiptStyle, setReceiptStyle] = React.useState<"classic" | "centered">("classic");

  // WiFi printer
  const [networkIp, setNetworkIp] = React.useState("");
  const [networkPort, setNetworkPort] = React.useState("9100");
  const [networkLabel, setNetworkLabel] = React.useState("");
  const [netBusy, setNetBusy] = React.useState(false);

  const logoFileRef = React.useRef<HTMLInputElement>(null);
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
    setDefaultPrinterType(s.defaultPrinterType ?? s.printerConnection ?? "none");
    setKotPrinterType(s.kotPrinterType ?? "none");
    setSalesDashboardPrinterType(s.salesDashboardPrinterType ?? "none");
    setPrinterSections(s.printerSections ?? []);
    setSectionPrinterMap(s.sectionPrinterMap ?? {});
    setLabelPrinterType(s.labelPrinterType ?? "none");
    setLabelPrinterLanguage(s.labelPrinterLanguage ?? "escpos");
    setLabelBtAddress(s.labelBtAddress ?? "");
    setLabelBtName(s.labelBtName ?? "");
    setLabelUsbDevice(s.labelUsbDevice ?? "");
    setLabelUsbLabel(s.labelUsbLabel ?? "");
    setReceiptSize(s.receiptSize ?? "2x3");
    setPaperSize(s.paperSize ?? "58");
    setSubPrinterMode(s.subPrinterMode ?? "own");
    setSubKotOnly(s.subKotOnly ?? false);
    // Receipt content
    setReceiptLogoPath(s.receiptLogoPath);
    setShowLogo(!!s.showLogo);
    setShowAddress(!!s.showAddress);
    setShowPhone(!!s.showPhone);
    setShowBusinessName(s.showBusinessNameOnReceipt !== false);
    setReceiptQrEnabled(!!s.receiptQrEnabled);
    setPosAutoPrintReceipt(!!s.posAutoPrintReceipt);
    setReceiptStyle(s.receiptStyle ?? "classic");
    // Network printer
    setNetworkIp(s.networkPrinterIp ?? "");
    setNetworkPort(String(s.networkPrinterPort ?? 9100));
    setNetworkLabel(s.networkPrinterLabel ?? "");
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Derive which printers are configured
  const hasBt = !!btPrinterAddress.trim();
  const hasUsb = !!usbDeviceName.trim();
  const hasNet = !!networkIp.trim();

  // Auto-set legacy connection field for backward compat
  const derivedConnection: PrinterType = hasBt && hasUsb ? "usb" : hasBt ? "bluetooth" : hasUsb ? "usb" : hasNet ? "network" : "none";

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
        // Network/WiFi printer
        networkPrinterIp: networkIp.trim() || undefined,
        networkPrinterPort: parseInt(networkPort) || 9100,
        networkPrinterLabel: networkLabel.trim() || undefined,
        // Default & section routing
        defaultPrinterType,
        kotPrinterType: kotPrinterType === "none" ? undefined : kotPrinterType,
        salesDashboardPrinterType: salesDashboardPrinterType === "none" ? undefined : salesDashboardPrinterType,
        salesKotEnabled: settings.salesKotEnabled,
        // Custom section routing
        printerSections,
        sectionPrinterMap,
        // Label printer
        labelPrinterType,
        labelPrinterLanguage,
        labelBtAddress: labelBtAddress.trim() || undefined,
        labelBtName: labelBtName.trim() || undefined,
        labelUsbDevice: labelUsbDevice.trim() || undefined,
        labelUsbLabel: labelUsbLabel.trim() || undefined,
        receiptSize,
        paperSize,
        subPrinterMode,
        subKotOnly,
        // Receipt content settings
        receiptLogoPath,
        showLogo,
        showAddress,
        showPhone,
        showBusinessNameOnReceipt: showBusinessName,
        receiptQrEnabled,
        posAutoPrintReceipt,
        receiptStyle,
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

  // Logo upload handler
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const fileName = `logo_${Date.now()}.${file.name.split(".").pop()}`;
        const path = `Sangi Pos/Images/${fileName}`;
        if (Capacitor.isNativePlatform()) {
          await Filesystem.writeFile({ directory: Directory.Data, path, data: base64, recursive: true });
        }
        setReceiptLogoPath(path);
        toast({ title: "Logo uploaded" });
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  // Available printer options for section routing
  const sectionOptions: { value: PrinterType; label: string }[] = [
    { value: "none", label: "None (No Printing)" },
    { value: "bluetooth", label: `Bluetooth${hasBt ? ` (${btPrinterName || btPrinterAddress})` : ""}` },
    { value: "usb", label: `USB${hasUsb ? ` (${usbPrinterLabel || usbDeviceName})` : ""}` },
    { value: "network", label: `WiFi${hasNet ? ` (${networkLabel || networkIp})` : ""}` },
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

      {/* ── WiFi Printer ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            WiFi Printer
            {hasNet && <Badge variant="outline" className="text-xs">Configured</Badge>}
          </CardTitle>
          <CardDescription>
            Connect to a thermal printer via WiFi. The printer must be on the same WiFi network and support RAW printing (port 9100).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Printer IP Address</Label>
              <input
                value={networkIp}
                onChange={(e) => setNetworkIp(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                placeholder="e.g. 192.168.1.100"
              />
            </div>
            <div className="space-y-2">
              <Label>Port (default: 9100)</Label>
              <input
                value={networkPort}
                onChange={(e) => setNetworkPort(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                placeholder="9100"
                type="number"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Printer name (optional)</Label>
            <input
              value={networkLabel}
              onChange={(e) => setNetworkLabel(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="e.g. Kitchen WiFi Printer"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={netBusy || !networkIp.trim()}
              onClick={async () => {
                setNetBusy(true);
                try {
                  const result = await netTestConnection(networkIp.trim(), parseInt(networkPort) || 9100);
                  if (result.reachable) {
                    toast({ title: "Printer reachable!", description: `Successfully connected to ${networkIp}:${networkPort}` });
                  } else {
                    toast({ title: "Cannot reach printer", description: result.error || "Check IP, port, and network connection.", variant: "destructive" });
                  }
                } catch (e: any) {
                  toast({ title: "Test failed", description: e?.message ?? String(e), variant: "destructive" });
                } finally {
                  setNetBusy(false);
                }
              }}
            >
              Test Connection
            </Button>
            <Button
              size="sm"
              disabled={netBusy || !networkIp.trim() || !isNativeAndroid()}
              onClick={async () => {
                setNetBusy(true);
                try {
                  await netConnect(networkIp.trim(), parseInt(networkPort) || 9100);
                  toast({ title: "WiFi printer connected" });
                } catch (e: any) {
                  toast({ title: "Could not connect", description: e?.message ?? String(e), variant: "destructive" });
                } finally {
                  setNetBusy(false);
                }
              }}
            >
              Connect
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={netBusy || !isNativeAndroid()}
              onClick={async () => {
                setNetBusy(true);
                try {
                  await netDisconnect();
                  toast({ title: "WiFi printer disconnected" });
                } catch (e: any) {
                  toast({ title: "Could not disconnect", description: e?.message ?? String(e), variant: "destructive" });
                } finally {
                  setNetBusy(false);
                }
              }}
            >
              Disconnect
            </Button>
            <Button size="sm" variant="default" onClick={() => void save()} disabled={!settings}>
              Save
            </Button>
          </div>

          {!isNativeAndroid() && (
            <p className="text-xs text-muted-foreground">
              WiFi printing works only in the installed Android app.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Default Printer & Section Routing ── */}
      <Card>
        <CardHeader>
          <CardTitle>Printer Assignment</CardTitle>
          <CardDescription>
            Set a default printer for all printing. Optionally override per section.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Default Printer */}
          <div className="space-y-2">
            <Label htmlFor="defaultPrinter" className="font-semibold">Default Printer</Label>
            <p className="text-xs text-muted-foreground">
              Used for sales receipts, advance booking, party/expenses, recovery, barcode labels, custom print, and any section without a specific printer.
            </p>
            <select
              id="defaultPrinter"
              value={defaultPrinterType}
              onChange={(e) => setDefaultPrinterType(e.target.value as PrinterType)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {sectionOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* KOT Printer */}
          <div className="space-y-2 border-t pt-3">
            <Label htmlFor="kotPrinter" className="font-semibold">KOT Printer (Kitchen Orders)</Label>
            <p className="text-xs text-muted-foreground">
              Dedicated printer for Kitchen Order Tickets (Table Management). If set to "Default", uses the Default Printer above.
            </p>
            <select
              id="kotPrinter"
              value={kotPrinterType}
              onChange={(e) => setKotPrinterType(e.target.value as PrinterType)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="none">Default Printer</option>
              {sectionOptions.filter(o => o.value !== "none").map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Sales Dashboard Printer */}
          <div className="space-y-2">
            <Label htmlFor="salesPrinter" className="font-semibold">Sales Printer (Sales Dashboard)</Label>
            <p className="text-xs text-muted-foreground">
              Dedicated printer for Sales Dashboard receipts. If set to "Default", uses the Default Printer above.
            </p>
            <select
              id="salesPrinter"
              value={salesDashboardPrinterType}
              onChange={(e) => setSalesDashboardPrinterType(e.target.value as PrinterType)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="none">Default Printer</option>
              {sectionOptions.filter(o => o.value !== "none").map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Sales KOT toggle */}
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <div>
              <Label className="font-semibold">Print KOT with Sales Receipt</Label>
              <p className="text-xs text-muted-foreground">
                Also print a simplified KOT slip (items, qty, date &amp; time only) alongside each Sales Dashboard receipt. Sent to KOT Printer.
              </p>
            </div>
            <Switch
              checked={settings?.salesKotEnabled ?? false}
              onCheckedChange={(v) => setSettings(prev => prev ? { ...prev, salesKotEnabled: v } : prev)}
            />
          </div>

          {/* Section Overrides */}
          {printerSections.length > 0 && (
            <>
              <div className="border-t pt-3">
                <Label className="font-semibold text-sm">Section Overrides</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Override the default printer for specific category sections. Leave as "None" to use the default printer.
                </p>
              </div>
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
                      <option value="none">Default Printer</option>
                      {sectionOptions.filter(o => o.value !== "none").map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}

          {!hasBt && !hasUsb && !hasNet && (
            <p className="text-xs text-muted-foreground">
              Configure at least one printer above to assign it.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Dedicated Label Printer ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Label Printer
            {labelPrinterType !== "none" && <Badge variant="outline" className="text-xs">Configured</Badge>}
          </CardTitle>
          <CardDescription>
            Optional dedicated printer for barcode labels (Zebra ZPL, TSC TSPL, or ESC/POS thermal).
            If not configured, labels will use the Default Printer with ESC/POS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="labelPrinterType">Connection</Label>
              <select
                id="labelPrinterType"
                value={labelPrinterType}
                onChange={(e) => setLabelPrinterType(e.target.value as PrinterType)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="none">None (use Default Printer)</option>
                <option value="bluetooth">Bluetooth</option>
                <option value="usb">USB</option>
                <option value="network">Network/WiFi</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="labelLanguage">Printer Language</Label>
              <select
                id="labelLanguage"
                value={labelPrinterLanguage}
                onChange={(e) => setLabelPrinterLanguage(e.target.value as LabelLanguage)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="escpos">ESC/POS (thermal receipt printers)</option>
                <option value="zpl">ZPL (Zebra label printers)</option>
                <option value="tspl">TSPL (TSC / Xprinter label printers)</option>
              </select>
            </div>
          </div>

          {labelPrinterType === "bluetooth" && (
            <div className="space-y-2">
              <Label>Label printer Bluetooth device</Label>
              <select
                value={labelBtAddress}
                onChange={(e) => setLabelBtAddress(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select printer…</option>
                {paired.map((d) => (
                  <option key={d.address} value={d.address}>
                    {(d.name ?? "(Unnamed)") + " — " + d.address}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                <Label>Printer name (optional)</Label>
                <input
                  value={labelBtName}
                  onChange={(e) => setLabelBtName(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  placeholder="e.g. Zebra ZD220"
                />
              </div>
              {paired.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Tap "Refresh paired devices" above to load Bluetooth devices.
                </p>
              )}
            </div>
          )}

          {labelPrinterType === "usb" && (
            <div className="space-y-2">
              <Label>Label printer USB device</Label>
              <select
                value={labelUsbDevice}
                onChange={(e) => setLabelUsbDevice(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select printer…</option>
                {usbDevices.map((d) => (
                  <option key={d.deviceName} value={d.deviceName}>
                    {(d.productName || d.manufacturerName || "USB Printer") + ` (${d.vendorId}:${d.productId})`}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                <Label>Printer label (optional)</Label>
                <input
                  value={labelUsbLabel}
                  onChange={(e) => setLabelUsbLabel(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  placeholder="e.g. Xprinter XP-360B"
                />
              </div>
              {usbDevices.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Tap "Refresh USB devices" above to load USB devices.
                </p>
              )}
            </div>
          )}

          <Button onClick={() => void save()} disabled={!settings} size="sm">
            Save
          </Button>
        </CardContent>
      </Card>

      {/* ── Receipt Content Settings ── */}
      <Card>
        <CardHeader>
          <CardTitle>Receipt Content</CardTitle>
          <CardDescription>Configure what appears on your printed receipts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-2">
            <Label>Receipt Logo</Label>
            <div className="flex items-center gap-3">
              <input ref={logoFileRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <Button variant="outline" onClick={() => logoFileRef.current?.click()}>
                {receiptLogoPath ? "Change Logo" : "Upload Logo"}
              </Button>
              {receiptLogoPath && <span className="text-sm text-muted-foreground truncate max-w-48">{receiptLogoPath.split("/").pop()}</span>}
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Show logo on receipt</div>
                <div className="text-xs text-muted-foreground">If enabled, browser receipts will display the logo.</div>
              </div>
              <Switch checked={showLogo} onCheckedChange={setShowLogo} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Show business name on receipt</div>
                <div className="text-xs text-muted-foreground">Display your business/restaurant name at the top of printed receipts.</div>
              </div>
              <Switch checked={showBusinessName} onCheckedChange={setShowBusinessName} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Show address on receipt</div>
                <div className="text-xs text-muted-foreground">If enabled, receipts will print the address line.</div>
              </div>
              <Switch checked={showAddress} onCheckedChange={setShowAddress} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Show phone on receipt</div>
                <div className="text-xs text-muted-foreground">If enabled, receipts will print the phone line.</div>
              </div>
              <Switch checked={showPhone} onCheckedChange={setShowPhone} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Print barcode on receipt</div>
                <div className="text-xs text-muted-foreground">Print a scannable barcode with receipt number. Scan it from POS to look up order details.</div>
              </div>
              <Switch checked={receiptQrEnabled} onCheckedChange={setReceiptQrEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Print receipt automatically</div>
                <div className="text-xs text-muted-foreground">After saving a sale, the app will ask to print immediately.</div>
              </div>
              <Switch checked={posAutoPrintReceipt} onCheckedChange={setPosAutoPrintReceipt} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receiptStyle">Receipt Style</Label>
            <select
              id="receiptStyle"
              value={receiptStyle}
              onChange={(e) => setReceiptStyle(e.target.value as "classic" | "centered")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="classic">Classic (left-aligned)</option>
              <option value="centered">Centered (kitchen-style)</option>
            </select>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
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
