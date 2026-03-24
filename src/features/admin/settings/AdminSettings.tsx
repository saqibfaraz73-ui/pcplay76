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
  const [taxApiFetchRate, setTaxApiFetchRate] = React.useState(false);
  const [taxReceiptFeeEnabled, setTaxReceiptFeeEnabled] = React.useState(false);
  const [taxReceiptFee, setTaxReceiptFee] = React.useState<number>(1);
  const [taxTestResult, setTaxTestResult] = React.useState("");
  const [taxQueueStats, setTaxQueueStats] = React.useState<{ pending: number; synced: number; failed: number } | null>(null);

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
  const [licenseDeviceId, setLicenseDeviceId] = React.useState("");
  const [licenseValidUntil, setLicenseValidUntil] = React.useState<number | undefined>(undefined);
  const [licensedDeviceId, setLicensedDeviceId] = React.useState("");
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
    setTaxApiFetchRate(!!s.taxApiFetchRate);
    setTaxReceiptFeeEnabled(!!s.taxReceiptFeeEnabled);
    setTaxReceiptFee(s.taxReceiptFee ?? 1);
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
    setLicenseDeviceId(lic.deviceId);
    setLicenseValidUntil(lic.validUntil);
    setLicensedDeviceId(lic.licensedDeviceId ?? "");

    // Load tax queue stats
    try {
      const { getQueueStats } = await import("@/features/tax/tax-queue");
      const stats = await getQueueStats();
      setTaxQueueStats(stats);
    } catch { /* queue not initialized */ }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);



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