import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/appDb";
import { useToast } from "@/hooks/use-toast";
import { ensureSangiFolders, shareFile, writeTextFile, folderPath } from "@/features/files/sangi-folders";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import { markBackupDone } from "./BackupReminder";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { CloudUpload } from "lucide-react";

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
    itemImages?: { path: string; data: string }[]; // base64 image data
  };
};

export function AdminBackupRestore() {
  const { toast } = useToast();
  const [lastBackupUri, setLastBackupUri] = React.useState<string | null>(null);
  const [lastBackupTitle, setLastBackupTitle] = React.useState<string>("");

  const backup = async () => {
    try {
      await ensureSangiFolders();

      // Collect item images as base64
      const items = await db.items.toArray();
      const itemImages: { path: string; data: string }[] = [];
      if (Capacitor.isNativePlatform()) {
        for (const item of items) {
          if (!item.imagePath) continue;
          try {
            const res = await Filesystem.readFile({ directory: Directory.Documents, path: item.imagePath });
            if (typeof res.data === "string") {
              itemImages.push({ path: item.imagePath, data: res.data });
            }
          } catch {
            // Skip if image file not found
          }
        }
      }

      const payload: BackupPayloadV1 = {
        version: 1,
        createdAt: Date.now(),
        data: {
          categories: await db.categories.toArray(),
          items,
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
          itemImages: itemImages.length > 0 ? itemImages : undefined,
        },
      };
      const fileName = `backup_${payload.createdAt}.json`;
      const { uri } = await writeTextFile({ folder: "Backup", fileName, contents: JSON.stringify(payload, null, 2) });
      setLastBackupUri(uri);
      setLastBackupTitle(fileName);
      markBackupDone();
      toast({ title: "Backup created", description: `${fileName}${itemImages.length > 0 ? ` (${itemImages.length} images included)` : ""}` });
    } catch (e: any) {
      toast({ title: "Backup failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const restoreFromPayload = async (payload: BackupPayloadV1) => {
    if (!payload?.data) throw new Error("Invalid backup file.");
    await db.transaction(
      "rw",
      [
        db.categories,
        db.items,
        db.inventory,
        db.inventoryAdjustments,
        db.customers,
        db.creditPayments,
        db.orders,
        db.workPeriods,
        db.expenses,
        db.suppliers,
        db.supplierPayments,
        db.settings,
        db.counters,
      ],
      async () => {
        await Promise.all([
          db.categories.clear(),
          db.items.clear(),
          db.inventory.clear(),
          db.inventoryAdjustments.clear(),
          db.customers.clear(),
          db.creditPayments.clear(),
          db.orders.clear(),
          db.workPeriods.clear(),
          db.expenses.clear(),
          db.suppliers.clear(),
          db.supplierPayments.clear(),
          db.settings.clear(),
          db.counters.clear(),
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
        await db.settings.bulkAdd(payload.data.settings);
        await db.counters.bulkAdd(payload.data.counters);
      },
    );

    // Restore item images to filesystem
    if (Capacitor.isNativePlatform() && payload.data.itemImages?.length) {
      await ensureSangiFolders();
      const itemsDir = `${folderPath("Images")}/items`;
      try {
        await Filesystem.mkdir({ directory: Directory.Documents, path: itemsDir, recursive: true });
      } catch { /* exists */ }
      // Create .nomedia to hide from gallery
      try {
        await Filesystem.writeFile({
          directory: Directory.Documents,
          path: `${itemsDir}/.nomedia`,
          data: "",
          encoding: Encoding.UTF8,
        });
      } catch { /* ignore */ }

      for (const img of payload.data.itemImages) {
        try {
          await Filesystem.writeFile({
            directory: Directory.Documents,
            path: img.path,
            data: img.data,
            recursive: true,
          });
        } catch {
          // Skip failed image restores
        }
      }
    }
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

  const shareToGoogleDrive = async () => {
    if (!lastBackupUri) {
      toast({ title: "Create a backup first", variant: "destructive" });
      return;
    }
    try {
      // Android Share sheet lets user choose Google Drive, Gmail, WhatsApp, etc.
      await Share.share({
        title: "SANGI POS Backup",
        text: "SANGI POS backup file — save to Google Drive",
        url: lastBackupUri,
        dialogTitle: "Save Backup to Google Drive",
      });
    } catch (e: any) {
      toast({ title: "Share failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup & Restore</CardTitle>
        <CardDescription>
          Backup exports all local data to a JSON file. Restore replaces all current data with the selected backup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void backup()}>Create Backup</Button>
          <Button
            variant="outline"
            disabled={!lastBackupUri}
            onClick={() => lastBackupUri && void shareFile({ title: "SANGI POS Backup", uri: lastBackupUri })}
          >
            Share Last Backup
          </Button>
        </div>

        {/* Google Drive backup */}
        {Capacitor.isNativePlatform() ? (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CloudUpload className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-medium">Backup to Google Drive</div>
            </div>
            <div className="text-xs text-muted-foreground">
              Creates a backup and opens the Android share sheet so you can save the file to Google Drive, Gmail, or any other app.
            </div>
            <Button 
              variant="outline" 
              disabled={!lastBackupUri}
              onClick={() => void shareToGoogleDrive()}
            >
              <CloudUpload className="h-4 w-4 mr-1" />
              {lastBackupUri ? "Save to Google Drive" : "Create Backup First"}
            </Button>
          </div>
        ) : null}

        <div className="rounded-md border p-3">
          <div className="text-sm font-medium">Restore</div>
          <div className="mt-1 text-xs text-muted-foreground">Choose a backup JSON file to restore (replace all data).</div>
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
