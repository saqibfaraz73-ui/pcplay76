import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/db/appDb";
import type { AdminAccount, ChargeType, Settings, StaffAccount } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { ensureSeedData } from "@/db/seed";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { AdminTablesWaiters } from "@/features/admin/tables/AdminTablesWaiters";
import { Trash2, Plus } from "lucide-react";
import { getLicense, updateLicense } from "@/features/licensing/licensing-db";
import { UpgradeDialog } from "@/features/licensing/UpgradeDialog";
import { DataCleanup } from "@/features/admin/settings/DataCleanup";
import { decodeLicenseBase64 } from "@/features/licensing/license-file";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function AdminSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Settings | null>(null);

  const [restaurantName, setRestaurantName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [showAddress, setShowAddress] = React.useState(false);
  const [showPhone, setShowPhone] = React.useState(false);
  const [showLogo, setShowLogo] = React.useState(false);
  const [posShowItemImages, setPosShowItemImages] = React.useState(true);
  const [posAutoPrintReceipt, setPosAutoPrintReceipt] = React.useState(false);

  // Tax settings
  const [taxEnabled, setTaxEnabled] = React.useState(false);
  const [taxType, setTaxType] = React.useState<ChargeType>("percent");
  const [taxValue, setTaxValue] = React.useState<number>(0);
  const [taxLabel, setTaxLabel] = React.useState("Tax");

  // Service charge settings
  const [serviceChargeEnabled, setServiceChargeEnabled] = React.useState(false);
  const [serviceChargeType, setServiceChargeType] = React.useState<ChargeType>("percent");
  const [serviceChargeValue, setServiceChargeValue] = React.useState<number>(0);
  const [serviceChargeLabel, setServiceChargeLabel] = React.useState("Service");

  // Report settings
  const [showCreditItemsInReport, setShowCreditItemsInReport] = React.useState(false);

  // Expiry date settings
  const [expiryDateEnabled, setExpiryDateEnabled] = React.useState(false);
  const [showExpiryOnDashboard, setShowExpiryOnDashboard] = React.useState(false);
  const [showExpiryOnReceipt, setShowExpiryOnReceipt] = React.useState(false);

  // Table Management settings
  const [tableManagementEnabled, setTableManagementEnabled] = React.useState(false);
  const [waiterLoginEnabled, setWaiterLoginEnabled] = React.useState(false);
  const [tableSelectionDisabled, setTableSelectionDisabled] = React.useState(false);

  // Advance/Booking settings
  const [advanceBookingEnabled, setAdvanceBookingEnabled] = React.useState(false);
  const [showAdvanceBookingInReports, setShowAdvanceBookingInReports] = React.useState(false);
  const [syncEnabled, setSyncEnabled] = React.useState(false);
  const [subWorkPeriodMode, setSubWorkPeriodMode] = React.useState<"own" | "main">("own");
  const [cashierReportsEnabled, setCashierReportsEnabled] = React.useState(false);
  const [cashierCancelOrderEnabled, setCashierCancelOrderEnabled] = React.useState(true);
  const [cashierEndWorkPeriodPendingCheck, setCashierEndWorkPeriodPendingCheck] = React.useState(true);
  const [waiterMainAppEnabled, setWaiterMainAppEnabled] = React.useState(false);
  const [waiterRestrictToOwnTables, setWaiterRestrictToOwnTables] = React.useState(false);
  const [supervisorPrinterEnabled, setSupervisorPrinterEnabled] = React.useState(false);
  const [waiterPrinterEnabled, setWaiterPrinterEnabled] = React.useState(false);
  const [recoveryPrinterEnabled, setRecoveryPrinterEnabled] = React.useState(false);
  const [salesDashboardEnabled, setSalesDashboardEnabled] = React.useState(true);
  const [skuSearchEnabled, setSkuSearchEnabled] = React.useState(false);
  const [deliveryEnabled, setDeliveryEnabled] = React.useState(false);
  const [recoveryEnabled, setRecoveryEnabled] = React.useState(false);

  // Admin account
  const [adminAccount, setAdminAccount] = React.useState<AdminAccount | null>(null);
  const [adminName, setAdminName] = React.useState("");
  const [adminPhone, setAdminPhone] = React.useState("");
  const [adminPassword, setAdminPassword] = React.useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = React.useState("");

  // Staff accounts
  const [staffAccounts, setStaffAccounts] = React.useState<StaffAccount[]>([]);
  const [newStaffName, setNewStaffName] = React.useState("");
  const [newStaffPhone, setNewStaffPhone] = React.useState("");
  const [newStaffRole, setNewStaffRole] = React.useState<"cashier" | "waiter" | "supervisor" | "recovery">("cashier");
  const [newStaffPin, setNewStaffPin] = React.useState("");
  const [deleteStaffId, setDeleteStaffId] = React.useState<string | null>(null);

  // Logo
  const [logoPath, setLogoPath] = React.useState<string | undefined>();
  const [deviceId, setDeviceId] = React.useState("");
  const [isPremium, setIsPremium] = React.useState(false);
  const [licenseText, setLicenseText] = React.useState("");
  const [showLicenseImport, setShowLicenseImport] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    await ensureSeedData();
    const s = await db.settings.get("app");
    if (!s) return;
    setSettings(s);
    setRestaurantName(s.restaurantName ?? "");
    setAddress(s.address ?? "");
    setPhone(s.phone ?? "");
    setShowAddress(!!s.showAddress);
    setShowPhone(!!s.showPhone);
    setShowLogo(!!s.showLogo);
    setPosShowItemImages(s.posShowItemImages ?? true);
    setPosAutoPrintReceipt(!!s.posAutoPrintReceipt);
    setTaxEnabled(!!s.taxEnabled);
    setTaxType(s.taxType ?? "percent");
    setTaxValue(s.taxValue ?? 0);
    setTaxLabel(s.taxLabel ?? "Tax");
    setServiceChargeEnabled(!!s.serviceChargeEnabled);
    setServiceChargeType(s.serviceChargeType ?? "percent");
    setServiceChargeValue(s.serviceChargeValue ?? 0);
    setServiceChargeLabel(s.serviceChargeLabel ?? "Service");
    setExpiryDateEnabled(!!s.expiryDateEnabled);
    setShowExpiryOnDashboard(!!s.showExpiryOnDashboard);
    setShowExpiryOnReceipt(!!s.showExpiryOnReceipt);
    setShowCreditItemsInReport(!!s.showCreditItemsInReport);
    setTableManagementEnabled(!!s.tableManagementEnabled);
    setWaiterLoginEnabled(!!s.waiterLoginEnabled);
    setTableSelectionDisabled(!!s.tableSelectionDisabled);
    setAdvanceBookingEnabled(!!s.advanceBookingEnabled);
    setShowAdvanceBookingInReports(!!s.showAdvanceBookingInReports);
    setSyncEnabled(!!s.syncEnabled);
    setSubWorkPeriodMode(s.subWorkPeriodMode ?? "own");
    setCashierReportsEnabled(!!s?.cashierReportsEnabled);
    setCashierCancelOrderEnabled(s?.cashierCancelOrderEnabled !== false); // default true
    setCashierEndWorkPeriodPendingCheck(s?.cashierEndWorkPeriodPendingCheck !== false); // default true
    setWaiterMainAppEnabled(!!s?.waiterMainAppEnabled);
    setWaiterRestrictToOwnTables(!!s?.waiterRestrictToOwnTables);
    setSupervisorPrinterEnabled(!!s?.supervisorPrinterEnabled);
    setWaiterPrinterEnabled(!!s?.waiterPrinterEnabled);
    setRecoveryPrinterEnabled(!!s?.recoveryPrinterEnabled);
    setSalesDashboardEnabled(s?.salesDashboardEnabled !== false); // default true
    setSkuSearchEnabled(!!s?.skuSearchEnabled);
    setDeliveryEnabled(!!s?.deliveryEnabled);
    setRecoveryEnabled(!!s?.recoveryEnabled);
    setLogoPath(s.receiptLogoPath);

    // Load admin account
    const admin = await db.adminAccount.get("admin");
    if (admin) {
      setAdminAccount(admin);
      setAdminName(admin.name);
      setAdminPhone(admin.phone);
    }

    // Load staff accounts
    const staff = await db.staffAccounts.toArray();
    setStaffAccounts(staff);

    // Load device ID
    const lic = await getLicense();
    setDeviceId(lic.deviceId);
    setIsPremium(lic.isPremium);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

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
          await Filesystem.writeFile({ directory: Directory.Documents, path, data: base64, recursive: true });
        }
        setLogoPath(path);
        toast({ title: "Logo uploaded" });
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const save = async () => {
    try {
      if (!settings) throw new Error("Settings not loaded.");
      const next: Settings = {
        ...settings,
        restaurantName: restaurantName.trim() || "SANGI POS",
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        showAddress,
        showPhone,
        showLogo,
        posShowItemImages,
        posAutoPrintReceipt,
        taxEnabled,
        taxType,
        taxValue,
        taxLabel: taxLabel.trim() || "Tax",
        serviceChargeEnabled,
        serviceChargeType,
        serviceChargeValue,
        serviceChargeLabel: serviceChargeLabel.trim() || "Service",
        expiryDateEnabled,
        showExpiryOnDashboard,
        showExpiryOnReceipt,
        showCreditItemsInReport,
        tableManagementEnabled,
        waiterLoginEnabled,
        tableSelectionDisabled,
        advanceBookingEnabled,
        showAdvanceBookingInReports,
        syncEnabled,
        subWorkPeriodMode,
        cashierReportsEnabled,
        cashierCancelOrderEnabled,
        cashierEndWorkPeriodPendingCheck,
        waiterMainAppEnabled,
        waiterRestrictToOwnTables,
        supervisorPrinterEnabled,
        waiterPrinterEnabled,
        recoveryPrinterEnabled,
        salesDashboardEnabled,
        skuSearchEnabled,
        deliveryEnabled,
        recoveryEnabled,
        receiptLogoPath: logoPath,
        updatedAt: Date.now(),
      };
      await db.settings.put(next);
      toast({ title: "Saved" });
      setSettings(next);
      // Notify nav to refresh immediately
      window.dispatchEvent(new Event("sangi-settings-changed"));
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const saveAdminAccount = async () => {
    if (!adminName.trim() || !adminPhone.trim()) {
      toast({ title: "Name and phone are required", variant: "destructive" });
      return;
    }
    if (adminPassword && adminPassword !== confirmAdminPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    const updated: AdminAccount = {
      id: "admin",
      name: adminName.trim(),
      phone: adminPhone.trim(),
      password: adminPassword.trim() || adminAccount?.password || "",
      securityQuestion: adminAccount?.securityQuestion || "",
      securityAnswer: adminAccount?.securityAnswer || "",
      createdAt: adminAccount?.createdAt || Date.now(),
    };
    await db.adminAccount.put(updated);
    setAdminAccount(updated);
    setAdminPassword("");
    setConfirmAdminPassword("");
    toast({ title: "Admin account updated" });
  };

  const addStaff = async () => {
    if (!newStaffName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!newStaffPin.trim() || newStaffPin.length !== 4 || !/^\d{4}$/.test(newStaffPin)) {
      toast({ title: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    // Check duplicate name
    const exists = staffAccounts.find((s) => s.name.toLowerCase() === newStaffName.trim().toLowerCase());
    if (exists) {
      toast({ title: "Staff name already exists", variant: "destructive" });
      return;
    }
    const staff: StaffAccount = {
      id: id("staff"),
      name: newStaffName.trim(),
      phone: newStaffPhone.trim() || undefined,
      role: newStaffRole,
      pin: newStaffPin,
      createdAt: Date.now(),
    };
    await db.staffAccounts.add(staff);
    setStaffAccounts((prev) => [...prev, staff]);
    setNewStaffName("");
    setNewStaffPhone("");
    setNewStaffPin("");
    toast({ title: `${newStaffRole === "cashier" ? "Cashier" : newStaffRole === "supervisor" ? "Supervisor" : newStaffRole === "recovery" ? "Recovery Agent" : "Waiter"} added` });
  };

  const deleteStaff = async (staffId: string) => {
    await db.staffAccounts.delete(staffId);
    setStaffAccounts((prev) => prev.filter((s) => s.id !== staffId));
    setDeleteStaffId(null);
    toast({ title: "Staff removed" });
  };

  return (
    <div className="space-y-4">
      {/* Device ID & License */}
      <Card>
        <CardHeader>
          <CardTitle>Device ID</CardTitle>
          <CardDescription>
            {isPremium ? "This device is activated (Premium)." : "Share this ID with support for activation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="rounded-md border bg-muted/50 px-4 py-3 font-mono text-sm tracking-wider select-all cursor-pointer"
            onClick={() => {
              navigator.clipboard?.writeText(deviceId);
              toast({ title: "Device ID copied" });
            }}
          >
            {deviceId || "Loading..."}
            <p className="text-xs text-muted-foreground mt-1 font-sans">Tap to copy</p>
          </div>

          {isPremium && (
            <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              Premium Active
            </div>
          )}

          {!isPremium && (
            <div className="border-t pt-3 space-y-3">
              <input
                type="file"
                accept=".sangi"
                className="hidden"
                ref={(el) => { (window as any).__licFileInput = el; }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const decoded = decodeLicenseBase64(text);
                    if (!decoded) {
                      toast({ title: "Invalid license file", description: "The file is invalid or corrupted.", variant: "destructive" });
                      return;
                    }
                    if (decoded.deviceId !== deviceId) {
                      toast({ title: "License mismatch", description: "This license file is for a different device.", variant: "destructive" });
                      return;
                    }
                    await updateLicense({ isPremium: true, licensedDeviceId: decoded.deviceId });
                    setIsPremium(true);
                    toast({ title: "🎉 Premium Activated!", description: "Your device is now premium." });
                  } catch {
                    toast({ title: "Could not read file", variant: "destructive" });
                  }
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => (window as any).__licFileInput?.click()}
              >
                📄 Import License File
              </Button>
              <p className="text-xs text-muted-foreground">
                Select the <code className="bg-muted px-1 rounded">license.sangi</code> file received from support.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business & Receipt Settings</CardTitle>
          <CardDescription>Basic settings used for receipts and reports.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="restaurantName">Business Name</Label>
              <Input id="restaurantName" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address">Address (optional)</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Receipt Logo</Label>
            <div className="flex items-center gap-3">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                {logoPath ? "Change Logo" : "Upload Logo"}
              </Button>
              {logoPath && <span className="text-sm text-muted-foreground truncate max-w-48">{logoPath.split("/").pop()}</span>}
            </div>
          </div>

          <div className="grid gap-2">
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
                <div className="text-sm font-medium">Show logo on receipt</div>
                <div className="text-xs text-muted-foreground">If enabled, browser receipts will display the logo.</div>
              </div>
              <Switch checked={showLogo} onCheckedChange={setShowLogo} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Show item images in POS</div>
                <div className="text-xs text-muted-foreground">If disabled, POS will hide product images for faster performance.</div>
              </div>
              <Switch checked={posShowItemImages} onCheckedChange={setPosShowItemImages} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Enable SKU / Barcode search</div>
                <div className="text-xs text-muted-foreground">Show SKU on POS items and allow searching by SKU/barcode.</div>
              </div>
              <Switch checked={skuSearchEnabled} onCheckedChange={setSkuSearchEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Print receipt automatically</div>
                <div className="text-xs text-muted-foreground">After saving a sale, the app will ask to print immediately.</div>
              </div>
              <Switch checked={posAutoPrintReceipt} onCheckedChange={setPosAutoPrintReceipt} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
        </CardContent>
      </Card>

      {/* Tax & Service Charges */}
      <Card>
        <CardHeader>
          <CardTitle>Tax & Service Charges</CardTitle>
          <CardDescription>Configure automatic tax and service charges on receipts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Enable Tax</div>
                <div className="text-xs text-muted-foreground">Add tax automatically to all orders.</div>
              </div>
              <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
            </div>
            {taxEnabled && (
              <div className="grid gap-3 sm:grid-cols-3 pl-3 border-l-2 border-primary/20">
                <div className="space-y-2">
                  <Label htmlFor="taxLabel">Label</Label>
                  <Input id="taxLabel" value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} placeholder="Tax" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxType">Type</Label>
                  <select id="taxType" value={taxType} onChange={(e) => setTaxType(e.target.value as ChargeType)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxValue">Value</Label>
                  <Input id="taxValue" type="number" inputMode="decimal" value={taxValue || ""} onChange={(e) => setTaxValue(Number(e.target.value) || 0)} placeholder={taxType === "percent" ? "e.g. 5" : "e.g. 100"} />
                  <p className="text-xs text-muted-foreground">{taxType === "percent" ? "Enter percentage (e.g. 5 for 5%)" : "Enter fixed amount"}</p>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Enable Service Charge</div>
                <div className="text-xs text-muted-foreground">Add service charge automatically to all orders.</div>
              </div>
              <Switch checked={serviceChargeEnabled} onCheckedChange={setServiceChargeEnabled} />
            </div>
            {serviceChargeEnabled && (
              <div className="grid gap-3 sm:grid-cols-3 pl-3 border-l-2 border-primary/20">
                <div className="space-y-2">
                  <Label htmlFor="serviceLabel">Label</Label>
                  <Input id="serviceLabel" value={serviceChargeLabel} onChange={(e) => setServiceChargeLabel(e.target.value)} placeholder="Service" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serviceType">Type</Label>
                  <select id="serviceType" value={serviceChargeType} onChange={(e) => setServiceChargeType(e.target.value as ChargeType)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serviceValue">Value</Label>
                  <Input id="serviceValue" type="number" inputMode="decimal" value={serviceChargeValue || ""} onChange={(e) => setServiceChargeValue(Number(e.target.value) || 0)} placeholder={serviceChargeType === "percent" ? "e.g. 10" : "e.g. 50"} />
                  <p className="text-xs text-muted-foreground">{serviceChargeType === "percent" ? "Enter percentage (e.g. 10 for 10%)" : "Enter fixed amount"}</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save Charges</Button>
          </div>
        </CardContent>
      </Card>

      {/* Expiry Date Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Expiry Date Settings</CardTitle>
          <CardDescription>Configure expiry date tracking and display options for items.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable expiry dates</div>
              <div className="text-xs text-muted-foreground">Allow setting expiry dates when adding/editing items.</div>
            </div>
            <Switch checked={expiryDateEnabled} onCheckedChange={setExpiryDateEnabled} />
          </div>
          {expiryDateEnabled && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Show expiry on POS dashboard</div>
                  <div className="text-xs text-muted-foreground">Display expiry date under items in the sales dashboard.</div>
                </div>
                <Switch checked={showExpiryOnDashboard} onCheckedChange={setShowExpiryOnDashboard} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Show expiry on receipts</div>
                  <div className="text-xs text-muted-foreground">Print expiry date for items on receipts.</div>
                </div>
                <Switch checked={showExpiryOnReceipt} onCheckedChange={setShowExpiryOnReceipt} />
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save Expiry Settings</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table Management Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Table Management</CardTitle>
          <CardDescription>Enable table service mode for dine-in restaurants with waiters.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Table Management</div>
              <div className="text-xs text-muted-foreground">Add "Tables" to the POS menu for dine-in service with waiters.</div>
            </div>
            <Switch checked={tableManagementEnabled} onCheckedChange={setTableManagementEnabled} />
          </div>
          {tableManagementEnabled && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Waiter login</div>
                  <div className="text-xs text-muted-foreground">Allow waiters to log in with their own credentials.</div>
                </div>
                <Switch checked={waiterLoginEnabled} onCheckedChange={setWaiterLoginEnabled} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Disable table selection</div>
                  <div className="text-xs text-muted-foreground">Skip table picking — cashier only selects a waiter.</div>
                </div>
                <Switch checked={tableSelectionDisabled} onCheckedChange={setTableSelectionDisabled} />
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save Table Settings</Button>
          </div>
          {tableManagementEnabled && settings?.tableManagementEnabled && (
            <div className="mt-4 border-t pt-4">
              <AdminTablesWaiters />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advance/Booking Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Advance / Booking Orders</CardTitle>
          <CardDescription>Enable advance item sales and time-based booking features.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Advance/Booking</div>
              <div className="text-xs text-muted-foreground">Add "Advance/Booking" to the POS menu for advance sales and time-based bookings.</div>
            </div>
            <Switch checked={advanceBookingEnabled} onCheckedChange={setAdvanceBookingEnabled} />
          </div>
          {advanceBookingEnabled && (
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Show in reports</div>
                <div className="text-xs text-muted-foreground">Include advance/booking totals in the sales report and PDF.</div>
              </div>
              <Switch checked={showAdvanceBookingInReports} onCheckedChange={setShowAdvanceBookingInReports} />
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
        </CardContent>
      </Card>

      {/* Sync Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Device Sync</CardTitle>
          <CardDescription>Enable multi-device sync for Main/Sub device setup over local network.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Sync</div>
              <div className="text-xs text-muted-foreground">Show "Sync" in the menu for all roles to configure Main/Sub device roles.</div>
            </div>
            <Switch checked={syncEnabled} onCheckedChange={setSyncEnabled} />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader>
          <CardTitle>Permissions & Features</CardTitle>
          <CardDescription>Control access and visibility for different roles.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Sales Dashboard</div>
              <div className="text-xs text-muted-foreground">Show the Sales Dashboard page for cashiers and admin.</div>
            </div>
            <Switch checked={salesDashboardEnabled} onCheckedChange={setSalesDashboardEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Delivery</div>
              <div className="text-xs text-muted-foreground">Show the Delivery section in admin menu.</div>
            </div>
            <Switch checked={deliveryEnabled} onCheckedChange={setDeliveryEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Recovery</div>
              <div className="text-xs text-muted-foreground">Show the Recovery section for bill collection (e.g. internet services).</div>
            </div>
            <Switch checked={recoveryEnabled} onCheckedChange={setRecoveryEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Allow cashier to view Reports</div>
              <div className="text-xs text-muted-foreground">If enabled, cashiers can access the Reports section.</div>
            </div>
            <Switch checked={cashierReportsEnabled} onCheckedChange={setCashierReportsEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Allow cashier to cancel orders</div>
              <div className="text-xs text-muted-foreground">If disabled, only admin can cancel orders.</div>
            </div>
            <Switch checked={cashierCancelOrderEnabled} onCheckedChange={setCashierCancelOrderEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Pending orders check on work period end</div>
              <div className="text-xs text-muted-foreground">Show warning about open table orders when ending a work period.</div>
            </div>
            <Switch checked={cashierEndWorkPeriodPendingCheck} onCheckedChange={setCashierEndWorkPeriodPendingCheck} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Allow supervisor to access Printer Settings</div>
              <div className="text-xs text-muted-foreground">If enabled, supervisors can configure printer settings.</div>
            </div>
            <Switch checked={supervisorPrinterEnabled} onCheckedChange={setSupervisorPrinterEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Allow waiter to access Printer Settings</div>
              <div className="text-xs text-muted-foreground">If enabled, waiters can configure printer settings.</div>
            </div>
            <Switch checked={waiterPrinterEnabled} onCheckedChange={setWaiterPrinterEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Allow recovery agent to access Printer Settings</div>
              <div className="text-xs text-muted-foreground">If enabled, recovery agents can configure printer settings.</div>
            </div>
            <Switch checked={recoveryPrinterEnabled} onCheckedChange={setRecoveryPrinterEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Allow waiter to use Main App (Sync)</div>
              <div className="text-xs text-muted-foreground">If enabled, waiters can set their device as the Main sync server.</div>
            </div>
            <Switch checked={waiterMainAppEnabled} onCheckedChange={setWaiterMainAppEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Restrict waiters to assigned tables</div>
              <div className="text-xs text-muted-foreground">If enabled, waiters can only take orders on tables assigned to them.</div>
            </div>
            <Switch checked={waiterRestrictToOwnTables} onCheckedChange={setWaiterRestrictToOwnTables} />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
        </CardContent>
      </Card>

      {/* Admin Account */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Account</CardTitle>
          <CardDescription>Update your admin name, phone, or password.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adminName">Name</Label>
              <Input id="adminName" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPhone">Phone (login ID)</Label>
              <Input id="adminPhone" inputMode="tel" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adminNewPass">New Password</Label>
              <Input id="adminNewPass" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Leave empty to keep current" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminConfirmPass">Confirm Password</Label>
              <Input id="adminConfirmPass" type="password" value={confirmAdminPassword} onChange={(e) => setConfirmAdminPassword(e.target.value)} />
            </div>
          </div>
          {adminPassword && confirmAdminPassword && adminPassword !== confirmAdminPassword && (
            <p className="text-xs text-destructive">Passwords do not match.</p>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void saveAdminAccount()} disabled={adminPassword !== "" && adminPassword !== confirmAdminPassword}>
              Update Admin
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Staff Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Accounts</CardTitle>
          <CardDescription>Create cashier and waiter logins. Staff log in with their name or mobile number + 4-digit PIN.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Add new staff */}
          <div className="grid gap-3 sm:grid-cols-5 items-end">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="e.g. Ali" />
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={newStaffPhone} onChange={(e) => setNewStaffPhone(e.target.value)} inputMode="tel" placeholder="e.g. 03001234567" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value as "cashier" | "waiter" | "supervisor" | "recovery")} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="cashier">Cashier</option>
                <option value="waiter">Waiter</option>
                <option value="supervisor">Supervisor</option>
                <option value="recovery">Recovery Agent</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>4-Digit PIN</Label>
              <Input value={newStaffPin} onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="e.g. 1234" />
            </div>
            <Button onClick={() => void addStaff()} className="gap-1">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {/* Staff list */}
          {staffAccounts.length > 0 ? (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Phone</th>
                    <th className="px-3 py-2 text-left font-medium">Role</th>
                    <th className="px-3 py-2 text-left font-medium">PIN</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {staffAccounts.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.phone || "—"}</td>
                      <td className="px-3 py-2 capitalize">{s.role}</td>
                      <td className="px-3 py-2 font-mono">{s.pin}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="icon" onClick={() => setDeleteStaffId(s.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No staff accounts yet. Add a cashier or waiter above.</p>
          )}
        </CardContent>
      </Card>

      {/* Data Cleanup */}
      <DataCleanup />

      {/* Delete staff confirmation */}
      <AlertDialog open={!!deleteStaffId} onOpenChange={() => setDeleteStaffId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove staff?</AlertDialogTitle>
            <AlertDialogDescription>This staff member will no longer be able to log in.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteStaffId && deleteStaff(deleteStaffId)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}