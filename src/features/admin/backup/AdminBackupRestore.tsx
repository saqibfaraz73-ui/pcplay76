import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/appDb";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { markBackupDone } from "./BackupReminder";
import { CloudUpload, Download, Share2 } from "lucide-react";
import { saveTextFile as saveTextToDevice } from "@/features/pos/share-utils";

type BackupPayloadV1 = {
  version: 1;
  createdAt: number;
  data: {
    categories: any[];
    items: any[];
    inventory: any[];
    inventoryAdjustments: any[];
    customers: any[];
    orders: any[];
    settings: any[];
    counters: any[];
    expenses?: any[];
    creditPayments?: any[];
    workPeriods?: any[];
    suppliers?: any[];
    supplierPayments?: any[];
    supplierArrivals?: any[];
    deliveryPersons?: any[];
    deliveryCustomers?: any[];
    waiters?: any[];
    restaurantTables?: any[];
    tableOrders?: any[];
    adminAccount?: any[];
    staffAccounts?: any[];
    exportCustomers?: any[];
    exportSales?: any[];
    exportPayments?: any[];
    advanceOrders?: any[];
    bookableItems?: any[];
    bookingOrders?: any[];
    recoveryCustomers?: any[];
    recoveryPayments?: any[];
  };
};

/** Write a temp cache file and share via Android share sheet — no SAF / no folder picker */
async function shareTextViaCache(content: string, fileName: string): Promise<void> {
  const tmpPath = `__share_tmp__/${fileName}`;
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    await Filesystem.writeFile({ directory: Directory.Cache, path: tmpPath, data: base64, recursive: true });
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: tmpPath });
    await Share.share({ title: fileName, url: uri, dialogTitle: "Share / Save Backup" });
  } finally {
    try { await Filesystem.deleteFile({ directory: Directory.Cache, path: tmpPath }); } catch { /* ignore */ }
  }
}

/** Web fallback: trigger a browser download */
function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AdminBackupRestore() {
  const { toast } = useToast();
  const [lastBackupContent, setLastBackupContent] = React.useState<{ fileName: string; content: string } | null>(null);

  const buildPayload = async (): Promise<{ fileName: string; content: string }> => {
    const payload: BackupPayloadV1 = {
      version: 1,
      createdAt: Date.now(),
      data: {
        categories: await db.categories.toArray(),
        items: await db.items.toArray(),
        inventory: await db.inventory.toArray(),
        inventoryAdjustments: await db.inventoryAdjustments.toArray(),
        customers: await db.customers.toArray(),
        orders: await db.orders.toArray(),
        settings: await db.settings.toArray(),
        counters: await db.counters.toArray(),
        expenses: await db.expenses.toArray(),
        creditPayments: await db.creditPayments.toArray(),
        workPeriods: await db.workPeriods.toArray(),
        suppliers: await db.suppliers.toArray(),
        supplierPayments: await db.supplierPayments.toArray(),
        supplierArrivals: await db.supplierArrivals.toArray(),
        deliveryPersons: await db.deliveryPersons.toArray(),
        deliveryCustomers: await db.deliveryCustomers.toArray(),
        waiters: await db.waiters.toArray(),
        restaurantTables: await db.restaurantTables.toArray(),
        tableOrders: await db.tableOrders.toArray(),
        adminAccount: await db.adminAccount.toArray(),
        staffAccounts: await db.staffAccounts.toArray(),
        exportCustomers: await db.exportCustomers.toArray(),
        exportSales: await db.exportSales.toArray(),
        exportPayments: await db.exportPayments.toArray(),
        advanceOrders: await db.advanceOrders.toArray(),
        bookableItems: await db.bookableItems.toArray(),
        bookingOrders: await db.bookingOrders.toArray(),
        recoveryCustomers: await db.recoveryCustomers.toArray(),
        recoveryPayments: await db.recoveryPayments.toArray(),
      },
    };
    const fileName = `backup_${payload.createdAt}.json`;
    const content = JSON.stringify(payload, null, 2);
    return { fileName, content };
  };

  /** Create backup and share via share sheet */
  const backupAndShare = async () => {
    try {
      const { fileName, content } = await buildPayload();
      setLastBackupContent({ fileName, content });
      markBackupDone();
      if (Capacitor.isNativePlatform()) {
        await shareTextViaCache(content, fileName);
      } else {
        // Web: use Web Share API fallback
        const blob = new Blob([content], { type: "application/json" });
        const file = new File([blob], fileName, { type: "application/json" });
        if (navigator.share) {
          try { await navigator.share({ title: fileName, files: [file] }); return; } catch {}
        }
        downloadTextFile(content, fileName);
        toast({ title: "Backup downloaded", description: fileName });
      }
    } catch (e: any) {
      toast({ title: "Backup failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  /** Create backup and save to device storage */
  const backupAndSave = async () => {
    try {
      const { fileName, content } = await buildPayload();
      setLastBackupContent({ fileName, content });
      markBackupDone();
      await saveTextToDevice(content, fileName);
    } catch (e: any) {
      toast({ title: "Backup failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  /** Re-share the last created backup without regenerating */
  const reshareBackup = async () => {
    if (!lastBackupContent) return;
    try {
      if (Capacitor.isNativePlatform()) {
        await shareTextViaCache(lastBackupContent.content, lastBackupContent.fileName);
      } else {
        downloadTextFile(lastBackupContent.content, lastBackupContent.fileName);
      }
    } catch (e: any) {
      toast({ title: "Share failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const restoreFromPayload = async (payload: BackupPayloadV1) => {
    if (!payload?.data) throw new Error("Invalid backup file.");
    await db.transaction(
      "rw",
      [
        db.categories, db.items, db.inventory, db.inventoryAdjustments,
        db.customers, db.creditPayments, db.orders, db.workPeriods, db.expenses,
        db.suppliers, db.supplierPayments, db.supplierArrivals,
        db.exportCustomers, db.exportSales, db.exportPayments,
        db.deliveryPersons, db.deliveryCustomers,
        db.waiters, db.restaurantTables, db.tableOrders,
        db.adminAccount, db.staffAccounts, db.settings, db.counters,
        db.advanceOrders, db.bookableItems, db.bookingOrders,
        db.recoveryCustomers, db.recoveryPayments,
      ],
      async () => {
        await Promise.all([
          db.categories.clear(), db.items.clear(), db.inventory.clear(),
          db.inventoryAdjustments.clear(), db.customers.clear(), db.creditPayments.clear(),
          db.orders.clear(), db.workPeriods.clear(), db.expenses.clear(),
          db.suppliers.clear(), db.supplierPayments.clear(), db.supplierArrivals.clear(),
          db.exportCustomers.clear(), db.exportSales.clear(), db.exportPayments.clear(),
          db.deliveryPersons.clear(), db.deliveryCustomers.clear(),
          db.waiters.clear(), db.restaurantTables.clear(), db.tableOrders.clear(),
          db.adminAccount.clear(), db.staffAccounts.clear(),
          db.settings.clear(), db.counters.clear(),
          db.advanceOrders.clear(), db.bookableItems.clear(), db.bookingOrders.clear(),
          db.recoveryCustomers.clear(), db.recoveryPayments.clear(),
        ]);
        await db.categories.bulkAdd(payload.data.categories);
        await db.items.bulkAdd(payload.data.items);
        await db.inventory.bulkAdd(payload.data.inventory);
        await db.inventoryAdjustments.bulkAdd(payload.data.inventoryAdjustments);
        await db.customers.bulkAdd(payload.data.customers);
        if (payload.data.creditPayments?.length) await db.creditPayments.bulkAdd(payload.data.creditPayments);
        await db.orders.bulkAdd(payload.data.orders);
        if (payload.data.workPeriods?.length) await db.workPeriods.bulkAdd(payload.data.workPeriods);
        if (payload.data.expenses?.length) await db.expenses.bulkAdd(payload.data.expenses);
        if (payload.data.suppliers?.length) await db.suppliers.bulkAdd(payload.data.suppliers);
        if (payload.data.supplierPayments?.length) await db.supplierPayments.bulkAdd(payload.data.supplierPayments);
        if (payload.data.supplierArrivals?.length) await db.supplierArrivals.bulkAdd(payload.data.supplierArrivals);
        if (payload.data.deliveryPersons?.length) await db.deliveryPersons.bulkAdd(payload.data.deliveryPersons);
        if (payload.data.deliveryCustomers?.length) await db.deliveryCustomers.bulkAdd(payload.data.deliveryCustomers);
        if (payload.data.waiters?.length) await db.waiters.bulkAdd(payload.data.waiters);
        if (payload.data.restaurantTables?.length) await db.restaurantTables.bulkAdd(payload.data.restaurantTables);
        if (payload.data.tableOrders?.length) await db.tableOrders.bulkAdd(payload.data.tableOrders);
        if (payload.data.adminAccount?.length) await db.adminAccount.bulkAdd(payload.data.adminAccount);
        if (payload.data.staffAccounts?.length) await db.staffAccounts.bulkAdd(payload.data.staffAccounts);
        if (payload.data.exportCustomers?.length) await db.exportCustomers.bulkAdd(payload.data.exportCustomers);
        if (payload.data.exportSales?.length) await db.exportSales.bulkAdd(payload.data.exportSales);
        if (payload.data.exportPayments?.length) await db.exportPayments.bulkAdd(payload.data.exportPayments);
        if (payload.data.advanceOrders?.length) await db.advanceOrders.bulkAdd(payload.data.advanceOrders);
        if (payload.data.bookableItems?.length) await db.bookableItems.bulkAdd(payload.data.bookableItems);
        if (payload.data.bookingOrders?.length) await db.bookingOrders.bulkAdd(payload.data.bookingOrders);
        if (payload.data.recoveryCustomers?.length) await db.recoveryCustomers.bulkAdd(payload.data.recoveryCustomers);
        if (payload.data.recoveryPayments?.length) await db.recoveryPayments.bulkAdd(payload.data.recoveryPayments);
        await db.settings.bulkAdd(payload.data.settings);
        await db.counters.bulkAdd(payload.data.counters);
      },
    );
  };

  const onRestoreFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayloadV1;
      if (parsed.version !== 1) throw new Error("Unsupported backup version.");
      await restoreFromPayload(parsed);
      toast({ title: "Restore complete", description: "Data replaced from backup." });
    } catch (e: any) {
      toast({ title: "Restore failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup & Restore</CardTitle>
        <CardDescription>
          Creates a backup and opens the share sheet — save to Google Drive, WhatsApp, or any app. No storage permission needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void backupAndSave()}>
            <Download className="h-4 w-4 mr-1" />
            Save Backup
          </Button>
          <Button variant="outline" onClick={() => void backupAndShare()}>
            <Share2 className="h-4 w-4 mr-1" />
            Share Backup
          </Button>
          {lastBackupContent && (
            <Button variant="outline" onClick={() => void reshareBackup()}>
              <CloudUpload className="h-4 w-4 mr-1" />
              Share Again
            </Button>
          )}
        </div>

        {lastBackupContent && (
          <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
            Last backup: <span className="font-medium text-foreground">{lastBackupContent.fileName}</span>
          </div>
        )}

        <div className="rounded-md border p-3">
          <div className="text-sm font-medium">Restore</div>
          <div className="mt-1 text-xs text-muted-foreground">Choose a backup JSON file to restore (replaces all data).</div>
          <div className="mt-3 space-y-2">
            <Label htmlFor="restoreFile">Backup file</Label>
            <Input
              id="restoreFile"
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onRestoreFile(f);
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
