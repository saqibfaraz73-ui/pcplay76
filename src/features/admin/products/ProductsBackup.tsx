import React from "react";
import { db } from "@/db/appDb";
import type { Category, MenuItem, InventoryRow, InventoryAdjustment } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const ITEM_IMAGES_DIR = "images/items";

type ImageEntry = { path: string; base64: string };

type ProductsBackupPayload = {
  type: "products_backup";
  version: 1;
  createdAt: number;
  categories: Category[];
  items: MenuItem[];
  inventory: InventoryRow[];
  inventoryAdjustments: InventoryAdjustment[];
  images: ImageEntry[];
};

/** Read all item images from filesystem and return as base64 entries */
async function readAllItemImages(items: MenuItem[]): Promise<ImageEntry[]> {
  if (!Capacitor.isNativePlatform()) return [];
  const entries: ImageEntry[] = [];
  for (const item of items) {
    if (!item.imagePath) continue;
    try {
      const result = await Filesystem.readFile({ directory: Directory.Data, path: item.imagePath });
      entries.push({ path: item.imagePath, base64: typeof result.data === "string" ? result.data : "" });
    } catch {
      // Try Documents dir (legacy)
      try {
        const result = await Filesystem.readFile({ directory: Directory.Documents, path: item.imagePath });
        entries.push({ path: item.imagePath, base64: typeof result.data === "string" ? result.data : "" });
      } catch {
        // Image not found, skip
      }
    }
  }
  return entries;
}

/** Restore item images to filesystem */
async function restoreItemImages(images: ImageEntry[]): Promise<void> {
  if (!Capacitor.isNativePlatform() || images.length === 0) return;
  try {
    await Filesystem.mkdir({ directory: Directory.Data, path: ITEM_IMAGES_DIR, recursive: true });
  } catch {}
  for (const img of images) {
    try {
      await Filesystem.writeFile({
        directory: Directory.Data,
        path: img.path,
        data: img.base64,
        recursive: true,
      });
    } catch {
      // skip individual failures
    }
  }
}

export function ProductsBackup({ onRestore }: { onRestore?: () => void }) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = React.useState(false);

  const exportBackup = async () => {
    setExporting(true);
    try {
      const [categories, items, inventory, inventoryAdjustments] = await Promise.all([
        db.categories.toArray(),
        db.items.toArray(),
        db.inventory.toArray(),
        db.inventoryAdjustments.toArray(),
      ]);
      const images = await readAllItemImages(items);
      const payload: ProductsBackupPayload = {
        type: "products_backup",
        version: 1,
        createdAt: Date.now(),
        categories,
        items,
        inventory,
        inventoryAdjustments,
        images,
      };
      const json = JSON.stringify(payload);
      const fileName = `products_backup_${Date.now()}.json`;

      if (Capacitor.isNativePlatform()) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(json);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const tmpPath = `__share_tmp__/${fileName}`;
        await Filesystem.writeFile({ directory: Directory.Cache, path: tmpPath, data: base64, recursive: true });
        const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: tmpPath });
        await Share.share({ title: fileName, url: uri, dialogTitle: "Share Products Backup" });
        try { await Filesystem.deleteFile({ directory: Directory.Cache, path: tmpPath }); } catch {}
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }

      toast({
        title: "Backup exported",
        description: `${categories.length} categories, ${items.length} items, ${images.length} images, ${inventory.length} inventory rows`,
      });
    } catch (e: any) {
      toast({ title: "Backup failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ProductsBackupPayload;
      if (data.type !== "products_backup") throw new Error("Not a valid products backup file.");

      await db.transaction("rw", [db.categories, db.items, db.inventory, db.inventoryAdjustments], async () => {
        await db.categories.clear();
        await db.items.clear();
        await db.inventory.clear();
        await db.inventoryAdjustments.clear();
        if (data.categories?.length) await db.categories.bulkPut(data.categories);
        if (data.items?.length) await db.items.bulkPut(data.items);
        if (data.inventory?.length) await db.inventory.bulkPut(data.inventory);
        if (data.inventoryAdjustments?.length) await db.inventoryAdjustments.bulkPut(data.inventoryAdjustments);
      });

      // Restore images to filesystem
      if (data.images?.length) {
        await restoreItemImages(data.images);
      }

      toast({
        title: "Backup restored",
        description: `${data.categories?.length ?? 0} categories, ${data.items?.length ?? 0} items, ${data.images?.length ?? 0} images restored`,
      });
      onRestore?.();
    } catch (err: any) {
      toast({ title: "Restore failed", description: err?.message ?? String(err), variant: "destructive" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base">Products Backup & Restore</CardTitle>
        <CardDescription>Export or import all products, categories, inventory, variations, add-ons, combos & images</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void exportBackup()} disabled={exporting}>
          <Download className="h-3.5 w-3.5 mr-1" /> {exporting ? "Exporting..." : "Export Backup"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Restore Backup
        </Button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importBackup} />
      </CardContent>
    </Card>
  );
}
