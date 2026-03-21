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
import { AdminTablesWaiters } from "@/features/admin/tables/AdminTablesWaiters";
import { Trash2, Plus, Search, X, Pencil } from "lucide-react";
import { getLicense } from "@/features/licensing/licensing-db";
import { TAX_COUNTRIES } from "@/features/tax/tax-presets";


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
  const [posShowItemImages, setPosShowItemImages] = React.useState(true);

  // Tax settings
  const [taxEnabled, setTaxEnabled] = React.useState(false);
  const [taxType, setTaxType] = React.useState<ChargeType>("percent");
  const [taxValue, setTaxValue] = React.useState<number>(0);
  const [taxLabel, setTaxLabel] = React.useState("Tax");
  const [taxCountry, setTaxCountry] = React.useState("");
  const [taxDepartment, setTaxDepartment] = React.useState("");
  // Tax API integration
  const [taxApiEnabled, setTaxApiEnabled] = React.useState(false);
  const [taxApiPosId, setTaxApiPosId] = React.useState("");
  const [taxApiKey, setTaxApiKey] = React.useState("");
  const [taxApiEndpoint, setTaxApiEndpoint] = React.useState("");
  const [taxApiBusinessNtn, setTaxApiBusinessNtn] = React.useState("");
  const [taxQrDisabled, setTaxQrDisabled] = React.useState(false);

  // Service charge settings
  const [serviceChargeEnabled, setServiceChargeEnabled] = React.useState(false);
  const [serviceChargeType, setServiceChargeType] = React.useState<ChargeType>("percent");
  const [serviceChargeValue, setServiceChargeValue] = React.useState<number>(0);
  const [serviceChargeLabel, setServiceChargeLabel] = React.useState("Service");
  const [serviceChargeForSales, setServiceChargeForSales] = React.useState(true);
  const [serviceChargeForTables, setServiceChargeForTables] = React.useState(true);

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
  const [syncPinRequired, setSyncPinRequired] = React.useState(false);
  const [subWorkPeriodMode, setSubWorkPeriodMode] = React.useState<"own" | "main">("own");
  const [cashierReportsEnabled, setCashierReportsEnabled] = React.useState(false);
  const [cashierCancelOrderEnabled, setCashierCancelOrderEnabled] = React.useState(true);
  const [cashierEndWorkPeriodPendingCheck, setCashierEndWorkPeriodPendingCheck] = React.useState(true);
  const [waiterMainAppEnabled, setWaiterMainAppEnabled] = React.useState(false);
  const [waiterRestrictToOwnTables, setWaiterRestrictToOwnTables] = React.useState(false);
  const [supervisorPrinterEnabled, setSupervisorPrinterEnabled] = React.useState(false);
  const [waiterPrinterEnabled, setWaiterPrinterEnabled] = React.useState(false);
  const [recoveryPrinterEnabled, setRecoveryPrinterEnabled] = React.useState(false);
  const [recoveryAgentAddCustomerEnabled, setRecoveryAgentAddCustomerEnabled] = React.useState(false);
  const [salesDashboardEnabled, setSalesDashboardEnabled] = React.useState(true);
  const [skuSearchEnabled, setSkuSearchEnabled] = React.useState(false);
  const [currencySymbol, setCurrencySymbolState] = React.useState("");
  const [deliveryEnabled, setDeliveryEnabled] = React.useState(false);
  const [recoveryEnabled, setRecoveryEnabled] = React.useState(false);
  const [installmentEnabled, setInstallmentEnabled] = React.useState(false);
  const [kitchenDisplayEnabled, setKitchenDisplayEnabled] = React.useState(false);

  // Admin account
  const [adminAccount, setAdminAccount] = React.useState<AdminAccount | null>(null);
  const [adminName, setAdminName] = React.useState("");
  const [adminPhone, setAdminPhone] = React.useState("");
  const [adminPassword, setAdminPassword] = React.useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = React.useState("");
  const [adminSecurityQuestion, setAdminSecurityQuestion] = React.useState("");
  const [adminSecurityAnswer, setAdminSecurityAnswer] = React.useState("");

  // Staff accounts
  const [staffAccounts, setStaffAccounts] = React.useState<StaffAccount[]>([]);
  const [newStaffName, setNewStaffName] = React.useState("");
  const [newStaffPhone, setNewStaffPhone] = React.useState("");
  const [newStaffRole, setNewStaffRole] = React.useState<"cashier" | "waiter" | "supervisor" | "recovery" | "kitchen" | "installment_agent">("cashier");
  const [newStaffPin, setNewStaffPin] = React.useState("");
  const [deleteStaffId, setDeleteStaffId] = React.useState<string | null>(null);
  const [editStaff, setEditStaff] = React.useState<StaffAccount | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editPhone, setEditPhone] = React.useState("");
  const [editRole, setEditRole] = React.useState<"cashier" | "waiter" | "supervisor" | "recovery" | "kitchen" | "installment_agent">("cashier");
  const [editPin, setEditPin] = React.useState("");

  
  const [isPremium, setIsPremium] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

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
    setPosShowItemImages(s.posShowItemImages ?? true);
    setTaxEnabled(!!s.taxEnabled);
    setTaxType(s.taxType ?? "percent");
    setTaxValue(s.taxValue ?? 0);
    setTaxLabel(s.taxLabel ?? "Tax");
    setTaxCountry(s.taxCountry ?? "");
    setTaxDepartment(s.taxDepartment ?? "");
    setTaxApiEnabled(!!s.taxApiEnabled);
    setTaxApiPosId(s.taxApiPosId ?? "");
    setTaxApiKey(s.taxApiKey ?? "");
    setTaxApiEndpoint(s.taxApiEndpoint ?? "");
    setTaxApiBusinessNtn(s.taxApiBusinessNtn ?? "");
    setTaxQrDisabled(!!s.taxQrDisabled);
    setServiceChargeEnabled(!!s.serviceChargeEnabled);
    setServiceChargeType(s.serviceChargeType ?? "percent");
    setServiceChargeValue(s.serviceChargeValue ?? 0);
    setServiceChargeLabel(s.serviceChargeLabel ?? "Service");
    setServiceChargeForSales(s.serviceChargeForSales !== false); // default true
    setServiceChargeForTables(s.serviceChargeForTables !== false); // default true
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
    setSyncPinRequired(!!s.syncPinRequired);
    setSubWorkPeriodMode(s.subWorkPeriodMode ?? "own");
    setCashierReportsEnabled(!!s?.cashierReportsEnabled);
    setCashierCancelOrderEnabled(s?.cashierCancelOrderEnabled !== false); // default true
    setCashierEndWorkPeriodPendingCheck(s?.cashierEndWorkPeriodPendingCheck !== false); // default true
    setWaiterMainAppEnabled(!!s?.waiterMainAppEnabled);
    setWaiterRestrictToOwnTables(!!s?.waiterRestrictToOwnTables);
    setSupervisorPrinterEnabled(!!s?.supervisorPrinterEnabled);
    setWaiterPrinterEnabled(!!s?.waiterPrinterEnabled);
    setRecoveryPrinterEnabled(!!s?.recoveryPrinterEnabled);
    setRecoveryAgentAddCustomerEnabled(!!s?.recoveryAgentAddCustomerEnabled);
    setSalesDashboardEnabled(s?.salesDashboardEnabled !== false); // default true
    setSkuSearchEnabled(!!s?.skuSearchEnabled);
    setCurrencySymbolState(s?.currencySymbol ?? "");
    setDeliveryEnabled(!!s?.deliveryEnabled);
    setRecoveryEnabled(!!s?.recoveryEnabled);
    setInstallmentEnabled(!!s?.installmentEnabled);
    setKitchenDisplayEnabled(!!s?.kitchenDisplayEnabled);

    // Load admin account
    const admin = await db.adminAccount.get("admin");
    if (admin) {
      setAdminAccount(admin);
      setAdminName(admin.name);
      setAdminPhone(admin.phone);
      setAdminSecurityQuestion(admin.securityQuestion || "");
      setAdminSecurityAnswer("");
    }

    // Load staff accounts
    const staff = await db.staffAccounts.toArray();
    setStaffAccounts(staff);

    const lic = await getLicense();
    setIsPremium(lic.isPremium);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);



  const save = async () => {
    try {
      if (!settings) throw new Error("Settings not loaded.");
      const next: Settings = {
        ...settings,
        restaurantName: restaurantName.trim() || "SANGI POS",
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        posShowItemImages,
        taxEnabled,
        taxType,
        taxValue,
        taxLabel: taxLabel.trim() || "Tax",
        taxCountry: taxCountry || undefined,
        taxDepartment: taxDepartment || undefined,
        taxApiEnabled,
        taxApiPosId: taxApiPosId.trim() || undefined,
        taxApiKey: taxApiKey.trim() || undefined,
        taxApiEndpoint: taxApiEndpoint.trim() || undefined,
        taxApiBusinessNtn: taxApiBusinessNtn.trim() || undefined,
        taxQrDisabled,
        serviceChargeEnabled,
        serviceChargeType,
        serviceChargeValue,
        serviceChargeLabel: serviceChargeLabel.trim() || "Service",
        serviceChargeForSales,
        serviceChargeForTables,
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
        syncPinRequired,
        subWorkPeriodMode,
        cashierReportsEnabled,
        cashierCancelOrderEnabled,
        cashierEndWorkPeriodPendingCheck,
        waiterMainAppEnabled,
        waiterRestrictToOwnTables,
        supervisorPrinterEnabled,
        waiterPrinterEnabled,
        recoveryPrinterEnabled,
        recoveryAgentAddCustomerEnabled,
        salesDashboardEnabled,
        skuSearchEnabled,
        currencySymbol: currencySymbol.trim(),
        deliveryEnabled,
        recoveryEnabled,
        installmentEnabled,
        kitchenDisplayEnabled,
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
      securityQuestion: adminSecurityQuestion.trim() || adminAccount?.securityQuestion || "",
      securityAnswer: adminSecurityAnswer.trim().toLowerCase() || adminAccount?.securityAnswer || "",
      createdAt: adminAccount?.createdAt || Date.now(),
    };
    await db.adminAccount.put(updated);
    setAdminAccount(updated);
    setAdminPassword("");
    setConfirmAdminPassword("");
    setAdminSecurityAnswer("");
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
    toast({ title: `${newStaffRole === "cashier" ? "Cashier" : newStaffRole === "supervisor" ? "Supervisor" : newStaffRole === "recovery" ? "Recovery Agent" : newStaffRole === "kitchen" ? "Kitchen Staff" : newStaffRole === "installment_agent" ? "Installment Agent" : "Waiter"} added` });
  };

  const openEditStaff = (s: StaffAccount) => {
    setEditStaff(s);
    setEditName(s.name);
    setEditPhone(s.phone || "");
    setEditRole(s.role as any);
    setEditPin(s.pin);
  };

  const saveEditStaff = async () => {
    if (!editStaff) return;
    if (!editName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!editPin || editPin.length !== 4 || !/^\d{4}$/.test(editPin)) {
      toast({ title: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    // Check duplicate name (exclude current)
    const dup = staffAccounts.find((s) => s.id !== editStaff.id && s.name.toLowerCase() === editName.trim().toLowerCase());
    if (dup) {
      toast({ title: "Staff name already exists", variant: "destructive" });
      return;
    }
    const updated: StaffAccount = {
      ...editStaff,
      name: editName.trim(),
      phone: editPhone.trim() || undefined,
      role: editRole,
      pin: editPin,
    };
    await db.staffAccounts.put(updated);
    setStaffAccounts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditStaff(null);
    toast({ title: "Staff account updated" });
  };

  const deleteStaff = async (staffId: string) => {
    await db.staffAccounts.delete(staffId);
    setStaffAccounts((prev) => prev.filter((s) => s.id !== staffId));
    setDeleteStaffId(null);
    toast({ title: "Staff removed" });
  };

  const sq = searchQuery.toLowerCase().trim();
  const match = (...keywords: string[]) => !sq || keywords.some(k => k.toLowerCase().includes(sq));

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search settings..."
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {match("business", "name", "currency", "address", "phone", "image", "sku", "barcode") && <Card>
        <CardHeader>
          <CardTitle>Business Settings</CardTitle>
          <CardDescription>Basic settings for your business.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="restaurantName">Business Name</Label>
              <Input id="restaurantName" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currencySymbol">Currency Symbol</Label>
              <select
                id="currencySymbol"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbolState(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">None (price only)</option>
                <option value="Rs">Rs — Pakistani Rupee</option>
                <option value="₹">₹ — Indian Rupee</option>
                <option value="$">$ — US Dollar</option>
                <option value="€">€ — Euro</option>
                <option value="£">£ — British Pound</option>
                <option value="¥">¥ — Japanese Yen / Chinese Yuan</option>
                <option value="د.إ">د.إ — UAE Dirham</option>
                <option value="﷼">﷼ — Saudi Riyal</option>
                <option value="৳">৳ — Bangladeshi Taka</option>
                <option value="RM">RM — Malaysian Ringgit</option>
                <option value="₺">₺ — Turkish Lira</option>
                <option value="R">R — South African Rand</option>
                <option value="A$">A$ — Australian Dollar</option>
                <option value="C$">C$ — Canadian Dollar</option>
                <option value="Fr">Fr — Swiss Franc</option>
              </select>
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

          <div className="grid gap-2">
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
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
        </CardContent>
      </Card>}

      {match("tax", "service", "charge", "percent", "country", "gst", "vat") && <Card>
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
              <>
                {/* Country preset picker */}
                <div className="pl-3 border-l-2 border-primary/20 space-y-3">
                  <div className="space-y-2">
                    <Label>Country Tax Preset <span className="text-xs text-muted-foreground font-normal">(optional — you can set tax manually below)</span></Label>
                    <select
                      value={taxCountry}
                      onChange={(e) => {
                        const code = e.target.value;
                        setTaxCountry(code);
                        setTaxDepartment("");
                        if (!code) return;
                        // Auto-set currency
                        const country = TAX_COUNTRIES.find(c => c.code === code);
                        if (country) {
                          setCurrencySymbolState(country.currencySymbol);
                          // Auto-apply first preset
                          if (country.presets.length === 1) {
                            const p = country.presets[0];
                            setTaxLabel(p.taxLabel);
                            setTaxValue(p.taxValue);
                            setTaxType("percent");
                            setTaxDepartment(p.department);
                          }
                        }
                      }}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="">— Select Country —</option>
                      {TAX_COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                      ))}
                    </select>
                  </div>

                  {taxCountry && (() => {
                    const country = TAX_COUNTRIES.find(c => c.code === taxCountry);
                    if (!country || country.presets.length <= 1) return null;
                    return (
                      <div className="space-y-2">
                        <Label>Tax Rate / Department</Label>
                        <select
                          value={taxDepartment}
                          onChange={(e) => {
                            const dept = e.target.value;
                            setTaxDepartment(dept);
                            const preset = country.presets.find(p => p.department === dept);
                            if (preset) {
                              setTaxLabel(preset.taxLabel);
                              setTaxValue(preset.taxValue);
                              setTaxType("percent");
                            }
                          }}
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">— Select Tax Rate —</option>
                          {country.presets.map(p => (
                            <option key={p.department} value={p.department}>
                              {p.department} — {p.taxValue}%
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}

                  {taxDepartment && (
                    <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                      📋 Tax Department: {taxDepartment}
                    </div>
                  )}
                </div>

                {/* Manual tax config (always visible for override) */}
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
              </>
            )}

            {/* Tax API Integration (inside tax section) */}
            {taxEnabled && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">Enable Tax API Integration</div>
                    <div className="text-xs text-muted-foreground">Connect to government tax authority (FBR, GSTN, ZATCA, HMRC) for real-time invoice reporting.</div>
                  </div>
                  <Switch checked={taxApiEnabled} onCheckedChange={setTaxApiEnabled} />
                </div>
                {taxApiEnabled && (
                  <div className="pl-3 border-l-2 border-primary/20 space-y-4">
                    {taxCountry && (
                      <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                        ℹ️ {taxCountry === "PK" ? "FBR ePOS Integration — Register your POS device at fbr.gov.pk" :
                            taxCountry === "IN" ? "GSTN e-Invoice — Register via your GSP (GST Suvidha Provider)" :
                            taxCountry === "SA" ? "ZATCA FATOORA — Register at zatca.gov.sa" :
                            taxCountry === "AE" ? "FTA Tax Registration — Register at tax.gov.ae" :
                            taxCountry === "GB" ? "HMRC MTD — Register for Making Tax Digital" :
                            "Register with your local tax authority to get API credentials."}
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Business NTN / GSTIN / TIN</Label>
                        <Input
                          value={taxApiBusinessNtn}
                          onChange={(e) => setTaxApiBusinessNtn(e.target.value)}
                          placeholder={taxCountry === "PK" ? "e.g. 1234567-8" : taxCountry === "IN" ? "e.g. 22AAAAA0000A1Z5" : "Tax ID number"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Registered POS ID</Label>
                        <Input
                          value={taxApiPosId}
                          onChange={(e) => setTaxApiPosId(e.target.value)}
                          placeholder="Your registered POS device ID"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>API Key / Token</Label>
                        <Input
                          type="password"
                          value={taxApiKey}
                          onChange={(e) => setTaxApiKey(e.target.value)}
                          placeholder="Secret API key"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>API Endpoint URL</Label>
                        <Input
                          value={taxApiEndpoint}
                          onChange={(e) => setTaxApiEndpoint(e.target.value)}
                          placeholder={taxCountry === "PK" ? "https://tp.fbr.gov.pk/..." : "https://api.example.com/..."}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ⚠️ Credentials stored locally. Invoices are queued offline and synced when internet returns.
                    </p>

                    {/* QR on receipt control */}
                    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div>
                        <div className="text-sm font-medium">Disable Tax QR on Receipt</div>
                        <div className="text-xs text-muted-foreground">Turn off the tax verification QR code on printed receipts even when API is connected.</div>
                      </div>
                      <Switch checked={taxQrDisabled} onCheckedChange={setTaxQrDisabled} />
                    </div>
                  </div>
                )}
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
              <>
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
                <div className="grid gap-3 sm:grid-cols-2 pl-3 border-l-2 border-primary/20">
                  <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">Apply to Sales</div>
                      <div className="text-xs text-muted-foreground">Charge on Sales Dashboard orders.</div>
                    </div>
                    <Switch checked={serviceChargeForSales} onCheckedChange={setServiceChargeForSales} />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">Apply to Tables</div>
                      <div className="text-xs text-muted-foreground">Charge on Table Management orders.</div>
                    </div>
                    <Switch checked={serviceChargeForTables} onCheckedChange={setServiceChargeForTables} />
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save Charges</Button>
          </div>
        </CardContent>
      </Card>}



      {match("expiry", "date") && <Card>
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
      </Card>}

      {match("table", "waiter", "dine", "supervisor") && <Card>
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
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Restrict waiters to assigned tables</div>
                  <div className="text-xs text-muted-foreground">If enabled, waiters can only take orders on tables assigned to them.</div>
                </div>
                <Switch checked={waiterRestrictToOwnTables} onCheckedChange={setWaiterRestrictToOwnTables} />
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
                  <div className="text-sm font-medium">Allow waiter to use Main App (Sync)</div>
                  <div className="text-xs text-muted-foreground">If enabled, waiters can set their device as the Main sync server.</div>
                </div>
                <Switch checked={waiterMainAppEnabled} onCheckedChange={setWaiterMainAppEnabled} />
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
                  <div className="text-sm font-medium">Pending orders check on work period end</div>
                  <div className="text-xs text-muted-foreground">Show warning about open table orders when ending a work period.</div>
                </div>
                <Switch checked={cashierEndWorkPeriodPendingCheck} onCheckedChange={setCashierEndWorkPeriodPendingCheck} />
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
      </Card>}

      {match("advance", "booking") && <Card>
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
      </Card>}

      {match("sync", "device", "multi") && <Card>
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
          {syncEnabled && (
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Require PIN for connections</div>
                <div className="text-xs text-muted-foreground">Sub devices and KDS devices must enter the correct PIN to connect. Set PIN on the Device Sync page.</div>
              </div>
              <Switch checked={syncPinRequired} onCheckedChange={setSyncPinRequired} />
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
        </CardContent>
      </Card>}

      {match("kitchen", "kds", "display") && <Card>
        <CardHeader>
          <CardTitle>Kitchen Display (KDS)</CardTitle>
          <CardDescription>Enable the kitchen display system for real-time order tracking between kitchen staff and customers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Kitchen Display</div>
              <div className="text-xs text-muted-foreground">Show "Kitchen Display" in the admin menu. Kitchen devices connect separately via /kitchen route.</div>
            </div>
            <Switch checked={kitchenDisplayEnabled} onCheckedChange={setKitchenDisplayEnabled} />
          </div>
          {kitchenDisplayEnabled && (
            <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
              <p>✅ Kitchen Display is enabled. Here's how it works:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li><strong>Main device</strong> receives orders and stores them as kitchen orders</li>
                <li><strong>Kitchen staff</strong> open <code>/kitchen</code> on a separate device, scan Main's IP barcode, and see the order queue</li>
                <li><strong>Customer display</strong> shows order statuses (pending → preparing → ready) on a TV/tablet</li>
                <li>Kitchen staff tap to update status → syncs back to Main → broadcasts to all displays</li>
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
        </CardContent>
      </Card>}

      {match("recovery", "bill", "collection", "agent") && <Card>
        <CardHeader>
          <CardTitle>Recovery / Bill Collection</CardTitle>
          <CardDescription>Configure recovery module for bill collection agents.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Recovery</div>
              <div className="text-xs text-muted-foreground">Show the Recovery section for bill collection (e.g. internet services).</div>
            </div>
            <Switch checked={recoveryEnabled} onCheckedChange={setRecoveryEnabled} />
          </div>
          {recoveryEnabled && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Allow agent to add/edit customers</div>
                  <div className="text-xs text-muted-foreground">If enabled, recovery agents can add, edit, and delete customers. Otherwise they only see assigned customers.</div>
                </div>
                <Switch checked={recoveryAgentAddCustomerEnabled} onCheckedChange={setRecoveryAgentAddCustomerEnabled} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Allow agent to access Printer Settings</div>
                  <div className="text-xs text-muted-foreground">If enabled, recovery agents can configure printer settings.</div>
                </div>
                <Switch checked={recoveryPrinterEnabled} onCheckedChange={setRecoveryPrinterEnabled} />
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save Recovery Settings</Button>
          </div>
        </CardContent>
      </Card>}

      {match("installment", "payment", "financing") && <Card>
        <CardHeader>
          <CardTitle>Installment Management</CardTitle>
          <CardDescription>Configure installment sales for product financing with monthly payments.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Installment</div>
              <div className="text-xs text-muted-foreground">Show the Installment tab in Admin for managing customers, payments, and agents.</div>
            </div>
            <Switch checked={installmentEnabled} onCheckedChange={setInstallmentEnabled} />
          </div>
          {installmentEnabled && (
            <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
              <p>✅ Installment enabled. Features:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>Add customers with product details, profit calculation, and tenure</li>
                <li>Record monthly installment payments with receipts</li>
                <li>Track paid/unpaid customers with late fee support</li>
                <li>Assign customers to Installment Agents for field collection</li>
                <li>Agent data export/import for multi-device workflows</li>
                <li>Import/export customers via Excel</li>
                <li>Reports with recovery, late fee, and agent commission breakdowns</li>
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
        </CardContent>
      </Card>}

      {match("permission", "dashboard", "delivery", "cashier", "report", "cancel") && <Card>
        <CardHeader>
          <CardTitle>General Permissions</CardTitle>
          <CardDescription>Control access for sales dashboard and cashier roles.</CardDescription>
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
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!settings}>Save</Button>
          </div>
        </CardContent>
      </Card>}

      {match("admin", "account", "password", "security") && <Card>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adminSecQ">Security Question</Label>
              <Input id="adminSecQ" value={adminSecurityQuestion} onChange={(e) => setAdminSecurityQuestion(e.target.value)} placeholder="e.g. Your pet's name?" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminSecA">New Security Answer</Label>
              <Input id="adminSecA" value={adminSecurityAnswer} onChange={(e) => setAdminSecurityAnswer(e.target.value)} placeholder="Leave empty to keep current" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void saveAdminAccount()} disabled={adminPassword !== "" && adminPassword !== confirmAdminPassword}>
              Update Admin
            </Button>
          </div>
        </CardContent>
      </Card>}

      {match("staff", "cashier", "waiter", "pin", "login") && <Card>
        <CardHeader>
          <CardTitle>Staff Accounts</CardTitle>
          <CardDescription>Create cashier and waiter logins. Staff log in with their name or mobile number + 4-digit PIN.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Add new staff */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 items-end">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="e.g. Ali" />
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="text-muted-foreground text-xs">(opt)</span></Label>
              <Input value={newStaffPhone} onChange={(e) => setNewStaffPhone(e.target.value)} inputMode="tel" placeholder="03001234567" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value as any)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="cashier">Cashier</option>
                <option value="waiter">Waiter</option>
                <option value="supervisor">Supervisor</option>
                <option value="recovery">Recovery Agent</option>
                {installmentEnabled && <option value="installment_agent">Installment Agent</option>}
                {kitchenDisplayEnabled && <option value="kitchen">Kitchen Staff</option>}
              </select>
            </div>
            <div className="space-y-2">
              <Label>4-Digit PIN</Label>
              <Input value={newStaffPin} onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="1234" />
            </div>
            <Button onClick={() => void addStaff()} className="gap-1 col-span-2 sm:col-span-1">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {/* Staff list — card layout for mobile, table for desktop */}
          {staffAccounts.length > 0 ? (
            <>
              {/* Mobile: card list */}
              <div className="space-y-2 sm:hidden">
                {staffAccounts.map((s) => (
                  <div key={s.id} className="rounded-md border p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                        <span className="capitalize">{s.role.replace("_", " ")}</span>
                        <span className="font-mono">PIN: {s.pin}</span>
                        {s.phone && <span>{s.phone}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => openEditStaff(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setDeleteStaffId(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop: table */}
              <div className="rounded-md border hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Phone</th>
                      <th className="px-3 py-2 text-left font-medium">Role</th>
                      <th className="px-3 py-2 text-left font-medium">PIN</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffAccounts.map((s) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="px-3 py-2">{s.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.phone || "—"}</td>
                        <td className="px-3 py-2 capitalize">{s.role.replace("_", " ")}</td>
                        <td className="px-3 py-2 font-mono">{s.pin}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditStaff(s)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteStaffId(s.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No staff accounts yet. Add a cashier or waiter above.</p>
          )}
        </CardContent>
      </Card>}


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

      {/* Edit staff dialog */}
      <AlertDialog open={!!editStaff} onOpenChange={(open) => { if (!open) setEditStaff(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Staff Account</AlertDialogTitle>
            <AlertDialogDescription>Update staff name, phone, role, or PIN.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} inputMode="tel" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select value={editRole} onChange={(e) => setEditRole(e.target.value as any)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="cashier">Cashier</option>
                <option value="waiter">Waiter</option>
                <option value="supervisor">Supervisor</option>
                <option value="recovery">Recovery Agent</option>
                <option value="installment_agent">Installment Agent</option>
                <option value="kitchen">Kitchen Staff</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>4-Digit PIN</Label>
              <Input value={editPin} onChange={(e) => setEditPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void saveEditStaff()}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}