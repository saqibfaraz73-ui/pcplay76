import React from "react";
import { Html5Qrcode } from "html5-qrcode";
import { playScanBeep } from "@/features/pos/scan-beep";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { db } from "@/db/appDb";
import type { Category, MenuItem, Settings, StockUnit, ItemVariation, ItemAddOn } from "@/db/schema";
import { STOCK_UNITS } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { parseNonDecimalInt, formatIntMoney } from "@/features/pos/format";
import { makeId } from "@/features/admin/id";
import { ItemImagePicker } from "@/features/admin/products/ItemImagePicker";
import { CalendarIcon, Download, Upload, ScanBarcode, FileUp, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { importSkuFromFile } from "@/features/admin/products/sku-import";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { exportMenuItemsToExcel, importMenuItemsFromCSV, downloadExcel } from "./menu-import-export";

type EditMode =
  | { type: "none" }
  | { type: "category"; category?: Category }
  | { type: "item"; item?: MenuItem };

export function AdminProducts() {
  const { toast } = useToast();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<EditMode>({ type: "none" });

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = React.useState<
    | { type: "category"; category: Category }
    | { type: "item"; item: MenuItem }
    | { type: "bulk-categories"; ids: string[] }
    | { type: "bulk-items"; ids: string[] }
    | null
  >(null);

  // Bulk selection state
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<Set<string>>(new Set());
  const [selectedItemIds, setSelectedItemIds] = React.useState<Set<string>>(new Set());

  const [catName, setCatName] = React.useState("");
  const [catPrinterSection, setCatPrinterSection] = React.useState("");
  const [catSectionPrinter, setCatSectionPrinter] = React.useState<"bluetooth" | "usb" | "none">("none");
  const [newSectionName, setNewSectionName] = React.useState("");
  const [printerSections, setPrinterSections] = React.useState<string[]>([]);
  const [sectionPrinterMap, setSectionPrinterMap] = React.useState<Record<string, string>>({});

  const [itemName, setItemName] = React.useState("");
  const [itemCategoryId, setItemCategoryId] = React.useState<string>("");
  const [itemPrice, setItemPrice] = React.useState<number>(0);
  const [itemBuyingPrice, setItemBuyingPrice] = React.useState<number>(0);
  const [itemImagePath, setItemImagePath] = React.useState<string>("");
  const [itemTrackInventory, setItemTrackInventory] = React.useState(true);
  const [itemStockUnit, setItemStockUnit] = React.useState<StockUnit>("pcs");
  const [itemInitialStock, setItemInitialStock] = React.useState<number>(0);
  const [itemIdDraft, setItemIdDraft] = React.useState<string>("");
  const [itemExpiryDate, setItemExpiryDate] = React.useState<Date | undefined>(undefined);
  const [itemVariations, setItemVariations] = React.useState<ItemVariation[]>([]);
  const [itemAddOns, setItemAddOns] = React.useState<ItemAddOn[]>([]);
  const [itemSku, setItemSku] = React.useState("");
  const [skuScanning, setSkuScanning] = React.useState(false);
  const skuScannerRef = React.useRef<HTMLDivElement>(null);
  const html5QrRef = React.useRef<Html5Qrcode | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const skuImportRef = React.useRef<HTMLInputElement>(null);
  const [skuImporting, setSkuImporting] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [cats, its, s] = await Promise.all([
      db.categories.orderBy("createdAt").toArray(),
      db.items.orderBy("createdAt").toArray(),
      db.settings.get("app"),
    ]);
    setCategories(cats);
    setItems(its);
    setSettings(s ?? null);
    setPrinterSections(s?.printerSections ?? []);
    setSectionPrinterMap(s?.sectionPrinterMap ?? {});
    setItemCategoryId((prev) => prev || cats[0]?.id || "");
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const openNewCategory = () => {
    setMode({ type: "category" });
    setCatName("");
    setCatPrinterSection("");
    setCatSectionPrinter("none");
    setNewSectionName("");
    setOpen(true);
  };

  const openEditCategory = (category: Category) => {
    setMode({ type: "category", category });
    setCatName(category.name);
    setCatPrinterSection(category.printerSection ?? "");
    setCatSectionPrinter(category.printerSection ? (sectionPrinterMap[category.printerSection] as any ?? "none") : "none");
    setNewSectionName("");
    setOpen(true);
  };

  const openNewItem = () => {
    setMode({ type: "item" });
    const id = makeId("item");
    setItemIdDraft(id);
    setItemName("");
    setItemPrice(0);
    setItemBuyingPrice(0);
    setItemImagePath("");
    setItemTrackInventory(true);
    setItemStockUnit("pcs");
    setItemInitialStock(0);
    setItemExpiryDate(undefined);
    setItemVariations([]);
    setItemAddOns([]);
    setItemSku("");
    setItemCategoryId(categories[0]?.id ?? "");
    setOpen(true);
  };

  const openEditItem = async (item: MenuItem) => {
    setMode({ type: "item", item });
    setItemIdDraft(item.id);
    setItemName(item.name);
    setItemCategoryId(item.categoryId);
    setItemPrice(Math.round(item.price));
    setItemBuyingPrice(item.buyingPrice ? Math.round(item.buyingPrice) : 0);
    setItemImagePath(item.imagePath ?? "");
    setItemTrackInventory(!!item.trackInventory);
    setItemStockUnit(item.stockUnit ?? "pcs");
    setItemExpiryDate(item.expiryDate ? new Date(item.expiryDate) : undefined);
    setItemVariations(item.variations ?? []);
    setItemAddOns(item.addOns ?? []);
    setItemSku(item.sku ?? "");
    const inv = await db.inventory.get(item.id);
    setItemInitialStock(inv?.quantity ?? 0);
    setOpen(true);
  };

  const save = async () => {
    try {
      if (mode.type === "category") {
        const name = catName.trim();
        if (!name) throw new Error("Category name is required.");
        const now = Date.now();
        const section = catPrinterSection.trim() || undefined;
        if (mode.category) {
          await db.categories.put({ ...mode.category, name, printerSection: section });
        } else {
          await db.categories.put({ id: makeId("cat"), name, printerSection: section, createdAt: now });
        }
        // Save section and its printer mapping to settings
        const s = await db.settings.get("app");
        if (s) {
          const newSections = section && !printerSections.includes(section)
            ? [...printerSections, section]
            : s.printerSections ?? printerSections;
          const newMap = { ...(s.sectionPrinterMap ?? sectionPrinterMap) };
          if (section) {
            newMap[section] = catSectionPrinter;
          }
          await db.settings.put({ ...s, printerSections: newSections, sectionPrinterMap: newMap as Settings["sectionPrinterMap"], updatedAt: Date.now() });
          setPrinterSections(newSections);
          setSectionPrinterMap(newMap);
        }
        toast({ title: "Saved" });
        setOpen(false);
        await refresh();
        return;
      }

      if (mode.type === "item") {
        const name = itemName.trim();
        if (!name) throw new Error("Item name is required.");
        if (!itemCategoryId) throw new Error("Category is required.");
        const now = Date.now();

        const id = mode.item?.id ?? itemIdDraft ?? makeId("item");

        const next: MenuItem = {
          id,
          categoryId: itemCategoryId,
          name,
          sku: itemSku.trim() || undefined,
          price: Math.round(itemPrice),
          buyingPrice: itemBuyingPrice > 0 ? Math.round(itemBuyingPrice) : undefined,
          imagePath: itemImagePath ? itemImagePath : undefined,
          trackInventory: itemTrackInventory,
          stockUnit: itemStockUnit !== "pcs" ? itemStockUnit : undefined,
          expiryDate: itemExpiryDate ? itemExpiryDate.getTime() : undefined,
          variations: itemVariations.length > 0 ? itemVariations.filter(v => v.name.trim() && v.price > 0) : undefined,
          addOns: itemAddOns.length > 0 ? itemAddOns.filter(a => a.name.trim() && a.price > 0) : undefined,
          createdAt: mode.item?.createdAt ?? now,
        };
        await db.items.put(next);

        // Create/update inventory row for tracked items
        if (itemTrackInventory) {
          const initial = Math.max(0, Math.round(itemInitialStock));
          await db.inventory.put({ itemId: next.id, quantity: initial, updatedAt: now });
        }

        toast({ title: "Saved" });
        setOpen(false);
        await refresh();
      }
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const confirmDeleteCategory = async (category: Category) => {
    // Prevent deleting if items exist in category
    const count = await db.items.where("categoryId").equals(category.id).count();
    if (count > 0) {
      toast({
        title: "Cannot delete category",
        description: "This category still has items. Move/delete items first.",
        variant: "destructive",
      });
      return;
    }
    await db.categories.delete(category.id);
    toast({ title: "Deleted" });
    setDeleteConfirm(null);
    await refresh();
  };

  const confirmDeleteItem = async (item: MenuItem) => {
    await db.items.delete(item.id);
    await db.inventory.delete(item.id);
    toast({ title: "Deleted" });
    setDeleteConfirm(null);
    await refresh();
  };

  const confirmBulkDeleteCategories = async (ids: string[]) => {
    for (const catId of ids) {
      const count = await db.items.where("categoryId").equals(catId).count();
      if (count > 0) {
        const cat = categories.find(c => c.id === catId);
        toast({ title: "Cannot delete", description: `"${cat?.name}" still has items. Move/delete items first.`, variant: "destructive" });
        return;
      }
    }
    await db.categories.bulkDelete(ids);
    toast({ title: `Deleted ${ids.length} categories` });
    setDeleteConfirm(null);
    setSelectedCategoryIds(new Set());
    await refresh();
  };

  const confirmBulkDeleteItems = async (ids: string[]) => {
    await db.items.bulkDelete(ids);
    await db.inventory.bulkDelete(ids);
    toast({ title: `Deleted ${ids.length} items` });
    setDeleteConfirm(null);
    setSelectedItemIds(new Set());
    await refresh();
  };

  const toggleCategorySelect = (id: string) => {
    setSelectedCategoryIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleItemSelect = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    try {
      const blob = await exportMenuItemsToExcel();
      downloadExcel(blob, `menu_items_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast({ title: "Menu exported successfully" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = await importMenuItemsFromCSV(text);
      
      if (result.success) {
        toast({ 
          title: "Import completed",
          description: `Created ${result.categoriesCreated} categories, ${result.itemsCreated} items. Updated ${result.itemsUpdated} items.`,
        });
        await refresh();
      }
      
      if (result.errors.length > 0) {
        console.warn("Import errors:", result.errors);
        toast({
          title: result.success ? "Import completed with warnings" : "Import failed",
          description: result.errors.slice(0, 3).join("\n"),
          variant: result.success ? "default" : "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message ?? String(e), variant: "destructive" });
    }
    
    // Reset input
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  };

  const stopSkuScanner = React.useCallback(() => {
    if (html5QrRef.current) {
      const qr = html5QrRef.current;
      html5QrRef.current = null;
      try {
        if (qr.isScanning) {
          qr.stop().then(() => { try { qr.clear(); } catch {} }).catch(() => {});
        } else {
          try { qr.clear(); } catch {}
        }
      } catch {
        // ignore
      }
    }
    setSkuScanning(false);
  }, []);

  const startSkuScanner = React.useCallback(() => {
    // Just show the div; actual scanner start happens in useEffect below
    setSkuScanning(true);
  }, []);

  // Start scanner after the div becomes visible
  React.useEffect(() => {
    if (!skuScanning || !skuScannerRef.current || html5QrRef.current) return;
    const scannerId = "sku-scanner-region";
    skuScannerRef.current.id = scannerId;
    const qr = new Html5Qrcode(scannerId);
    html5QrRef.current = qr;
    qr.start(
      { facingMode: "environment" },
      { fps: 15, qrbox: { width: 280, height: 120 }, videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" } as any] } },
      (decodedText) => {
        playScanBeep();
        setItemSku(decodedText);
        stopSkuScanner();
      },
      () => {},
    ).catch(() => setSkuScanning(false));
  }, [skuScanning, stopSkuScanner]);

  // Handle SKU import from file
  const handleSkuImport = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSkuImporting(true);
    try {
      const result = await importSkuFromFile(file);
      if (result) {
        playScanBeep();
        setItemSku(result);
        toast({ title: "Barcode detected", description: result });
      } else {
        toast({ title: "No barcode found", description: "Could not detect a barcode in the selected file.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Import failed", description: "Error reading the file.", variant: "destructive" });
    } finally {
      setSkuImporting(false);
      if (skuImportRef.current) skuImportRef.current.value = "";
    }
  }, [toast]);

  // Stop scanner when dialog closes
  React.useEffect(() => {
    if (!open) stopSkuScanner();
  }, [open, stopSkuScanner]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Categories</CardTitle>
              <CardDescription>Create, edit, and delete menu categories.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedCategoryIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirm({ type: "bulk-categories", ids: Array.from(selectedCategoryIds) })}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete ({selectedCategoryIds.size})
                </Button>
              )}
              <Button size="sm" onClick={openNewCategory}>New Category</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {categories.length > 0 && (
            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                checked={selectedCategoryIds.size === categories.length && categories.length > 0}
                onCheckedChange={(checked) => {
                  setSelectedCategoryIds(checked ? new Set(categories.map(c => c.id)) : new Set());
                }}
              />
              <span className="text-xs text-muted-foreground">Select all</span>
            </div>
          )}
          {categories.length === 0 ? (
            <div className="text-sm text-muted-foreground">No categories yet.</div>
          ) : (
            categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Checkbox
                    checked={selectedCategoryIds.has(c.id)}
                    onCheckedChange={() => toggleCategorySelect(c.id)}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    {c.printerSection && (
                      <div className="text-xs text-muted-foreground">Section: {c.printerSection}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openEditCategory(c)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm({ type: "category", category: c })}>
                    Del
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <div className="min-w-0">
            <CardTitle>Menu Items</CardTitle>
            <CardDescription>Create, edit, and delete items. Prices are integers (no decimals).</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportFile}
              className="hidden"
            />
            {selectedItemIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirm({ type: "bulk-items", ids: Array.from(selectedItemIds) })}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete ({selectedItemIds.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={items.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button size="sm" onClick={openNewItem} disabled={categories.length === 0}>
              New Item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length > 0 && (
            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                checked={selectedItemIds.size === items.length && items.length > 0}
                onCheckedChange={(checked) => {
                  setSelectedItemIds(checked ? new Set(items.map(i => i.id)) : new Set());
                }}
              />
              <span className="text-xs text-muted-foreground">Select all</span>
            </div>
          )}
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No items yet.</div>
          ) : (
            items.map((i) => {
              const cat = categories.find((c) => c.id === i.categoryId)?.name ?? "—";
              const profit =
                typeof i.buyingPrice === "number" && i.buyingPrice > 0 ? Math.round(i.price - i.buyingPrice) : null;
              const expiryStr = i.expiryDate ? format(new Date(i.expiryDate), "dd MMM yyyy") : null;
              const isExpired = i.expiryDate && i.expiryDate < Date.now();
              return (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Checkbox
                      checked={selectedItemIds.has(i.id)}
                      onCheckedChange={() => toggleItemSelect(i.id)}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{i.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {cat} • Sell {formatIntMoney(i.price)}
                        {i.sku ? <> • SKU: {i.sku}</> : null}
                        {typeof i.buyingPrice === "number" && i.buyingPrice > 0 ? (
                          <> • Buy {formatIntMoney(i.buyingPrice)}</>
                        ) : null}
                        {profit !== null ? <> • Profit {formatIntMoney(profit)}</> : null} •{" "}
                        {i.trackInventory ? `Stock tracked${i.stockUnit && i.stockUnit !== "pcs" ? ` (${i.stockUnit})` : ""}` : "No stock"}
                        {i.variations && i.variations.length > 0 ? (
                          <> • {i.variations.length} variant{i.variations.length > 1 ? "s" : ""}</>
                        ) : null}
                        {expiryStr ? (
                          <span className={cn(isExpired && "text-destructive")}> • Exp: {expiryStr}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openEditItem(i)}>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm({ type: "item", item: i })}>
                      Del
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>


      {/* Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {mode.type === "category"
                ? mode.category
                  ? "Edit Category"
                  : "New Category"
                : mode.type === "item"
                  ? mode.item
                    ? "Edit Item"
                    : "New Item"
                  : ""}
            </DialogTitle>
          </DialogHeader>

          {mode.type === "category" ? (
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="catName">Category name</Label>
                <Input id="catName" value={catName} onChange={(e) => setCatName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="catSection">Printer Section</Label>
                <div className="flex gap-2">
                  <select
                    id="catSection"
                    value={catPrinterSection}
                    onChange={(e) => setCatPrinterSection(e.target.value)}
                    className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">None (default)</option>
                    {printerSections.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="New section name..."
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!newSectionName.trim()}
                    onClick={() => {
                      const name = newSectionName.trim();
                      if (name && !printerSections.includes(name)) {
                        setPrinterSections((prev) => [...prev, name]);
                      }
                      setCatPrinterSection(name);
                      setNewSectionName("");
                    }}
                  >
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Assign a printer section to route printing to a specific printer. Create any name (e.g. A, B, Kitchen, Bar).
                </p>
              </div>
              {catPrinterSection.trim() && (
                <div className="space-y-2">
                  <Label htmlFor="catSectionPrinter">Printer for "{catPrinterSection}"</Label>
                  <select
                    id="catSectionPrinter"
                    value={catSectionPrinter}
                    onChange={(e) => setCatSectionPrinter(e.target.value as any)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="none">None (No Printing)</option>
                    <option value="bluetooth">Bluetooth</option>
                    <option value="usb">USB</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Choose which printer to use for this section.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {mode.type === "item" ? (
            <div className="grid gap-3 overflow-y-auto flex-1 pr-1">
              <ItemImagePicker
                itemId={itemIdDraft}
                imagePath={itemImagePath || undefined}
                onChangeImagePath={setItemImagePath}
              />

              <div className="space-y-2">
                <Label htmlFor="itemName">Item name</Label>
                <Input id="itemName" value={itemName} onChange={(e) => setItemName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="itemSku">SKU / Barcode (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="itemSku"
                    value={itemSku}
                    onChange={(e) => setItemSku(e.target.value)}
                    placeholder="Enter, scan or import"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant={skuScanning ? "destructive" : "outline"}
                    size="icon"
                    onClick={() => (skuScanning ? stopSkuScanner() : startSkuScanner())}
                    title="Scan barcode with camera"
                  >
                    <ScanBarcode className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => skuImportRef.current?.click()}
                    disabled={skuImporting}
                    title="Import barcode from file (image, PDF, ZPL, TSPL)"
                  >
                    <FileUp className="h-4 w-4" />
                  </Button>
                  <input
                    ref={skuImportRef}
                    type="file"
                    accept="image/*,.pdf,.zpl,.tspl,.tsc,.txt"
                    className="hidden"
                    onChange={handleSkuImport}
                  />
                </div>
                {skuImporting && <p className="text-xs text-muted-foreground">Detecting barcode…</p>}
                <div ref={skuScannerRef} className={skuScanning ? "mt-2 rounded-md overflow-hidden [&_img]:!hidden" : "hidden"} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="itemCategory">Category</Label>
                <select
                  id="itemCategory"
                  value={itemCategoryId}
                  onChange={(e) => setItemCategoryId(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="itemPrice">Price</Label>
                <Input
                  id="itemPrice"
                  inputMode="numeric"
                  value={itemPrice === 0 ? "" : String(itemPrice)}
                  placeholder="0"
                  onChange={(e) => setItemPrice(parseNonDecimalInt(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="itemBuyingPrice">Buying price (optional)</Label>
                <Input
                  id="itemBuyingPrice"
                  inputMode="numeric"
                  value={itemBuyingPrice === 0 ? "" : String(itemBuyingPrice)}
                  placeholder="Leave empty"
                  onChange={(e) => setItemBuyingPrice(parseNonDecimalInt(e.target.value))}
                />
                {itemBuyingPrice > 0 && itemPrice > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Profit preview: {formatIntMoney(Math.round(itemPrice - itemBuyingPrice))}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Track inventory</div>
                  <div className="text-xs text-muted-foreground">If enabled, sales will decrement stock.</div>
                </div>
                <Switch checked={itemTrackInventory} onCheckedChange={setItemTrackInventory} />
              </div>

              {itemTrackInventory ? (
                <div className="space-y-2">
                  <Label htmlFor="stockUnit">Stock unit</Label>
                  <select
                    id="stockUnit"
                    value={itemStockUnit}
                    onChange={(e) => setItemStockUnit(e.target.value as StockUnit)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {STOCK_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {itemTrackInventory ? (
                <div className="space-y-2">
                  <Label htmlFor="initialStock">
                    {mode.item ? "Current stock" : "Initial stock (optional)"}
                  </Label>
                  <Input
                    id="initialStock"
                    inputMode="numeric"
                    value={itemInitialStock === 0 ? "" : String(itemInitialStock)}
                    placeholder="0"
                    onChange={(e) => setItemInitialStock(parseNonDecimalInt(e.target.value))}
                  />
                </div>
              ) : null}

              {/* Variations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Variations (optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setItemVariations((prev) => [...prev, { name: "", price: 0 }])}
                  >
                    + Add Variant
                  </Button>
                </div>
                {itemVariations.length > 0 && (
                  <div className="space-y-2">
                    {itemVariations.map((v, idx) => (
                      <div key={idx} className="space-y-1 rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="e.g. Small"
                            value={v.name}
                            onChange={(e) => {
                              const next = [...itemVariations];
                              next[idx] = { ...next[idx], name: e.target.value };
                              setItemVariations(next);
                            }}
                            className="flex-1"
                          />
                          <Input
                            placeholder="Sell Price"
                            inputMode="numeric"
                            value={v.price === 0 ? "" : String(v.price)}
                            onChange={(e) => {
                              const next = [...itemVariations];
                              next[idx] = { ...next[idx], price: parseNonDecimalInt(e.target.value) };
                              setItemVariations(next);
                            }}
                            className="w-24"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => setItemVariations((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            ×
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Buy Price"
                            inputMode="numeric"
                            value={v.buyingPrice === undefined || v.buyingPrice === 0 ? "" : String(v.buyingPrice)}
                            onChange={(e) => {
                              const next = [...itemVariations];
                              next[idx] = { ...next[idx], buyingPrice: parseNonDecimalInt(e.target.value) || undefined };
                              setItemVariations(next);
                            }}
                            className="w-24"
                          />
                          {itemTrackInventory && (
                            <Input
                              placeholder="Stock"
                              inputMode="numeric"
                              value={v.stock === undefined || v.stock === 0 ? "" : String(v.stock)}
                              onChange={(e) => {
                                const next = [...itemVariations];
                                next[idx] = { ...next[idx], stock: parseNonDecimalInt(e.target.value) || undefined };
                                setItemVariations(next);
                              }}
                              className="w-20"
                            />
                          )}
                          {v.buyingPrice && v.price > 0 ? (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              Profit: {formatIntMoney(v.price - v.buyingPrice)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add-ons (per item) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Add-ons (optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setItemAddOns((prev) => [...prev, { name: "", price: 0 }])}
                  >
                    + Add Add-on
                  </Button>
                </div>
                {itemAddOns.length > 0 && (
                  <div className="space-y-2">
                    {itemAddOns.map((ao, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md border p-2">
                        <Input
                          placeholder="e.g. Extra Cheese"
                          value={ao.name}
                          onChange={(e) => {
                            const next = [...itemAddOns];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setItemAddOns(next);
                          }}
                          className="flex-1"
                        />
                        <Input
                          placeholder="Price"
                          inputMode="numeric"
                          value={ao.price === 0 ? "" : String(ao.price)}
                          onChange={(e) => {
                            const next = [...itemAddOns];
                            next[idx] = { ...next[idx], price: parseNonDecimalInt(e.target.value) };
                            setItemAddOns(next);
                          }}
                          className="w-24"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setItemAddOns((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expiry date picker */}
              {settings?.expiryDateEnabled && (
                <div className="space-y-2">
                  <Label>Expiry date (optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !itemExpiryDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {itemExpiryDate ? format(itemExpiryDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={itemExpiryDate}
                        onSelect={setItemExpiryDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  {itemExpiryDate && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setItemExpiryDate(undefined)}
                      className="text-xs"
                    >
                      Clear expiry date
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void save()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.type === "bulk-categories"
                ? `Delete ${deleteConfirm.ids.length} Categories?`
                : deleteConfirm?.type === "bulk-items"
                  ? `Delete ${deleteConfirm.ids.length} Items?`
                  : `Delete ${deleteConfirm?.type === "category" ? "Category" : "Item"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === "bulk-categories"
                ? `Are you sure you want to delete ${deleteConfirm.ids.length} selected categories? This cannot be undone.`
                : deleteConfirm?.type === "bulk-items"
                  ? `Are you sure you want to delete ${deleteConfirm.ids.length} selected items? This cannot be undone.`
                  : <>Are you sure you want to delete{" "}
                      <strong>
                        {deleteConfirm?.type === "category"
                          ? deleteConfirm.category.name
                          : deleteConfirm?.type === "item"
                            ? deleteConfirm.item.name
                            : ""}
                      </strong>
                      ? This action cannot be undone.
                    </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm?.type === "category") {
                  void confirmDeleteCategory(deleteConfirm.category);
                } else if (deleteConfirm?.type === "item") {
                  void confirmDeleteItem(deleteConfirm.item);
                } else if (deleteConfirm?.type === "bulk-categories") {
                  void confirmBulkDeleteCategories(deleteConfirm.ids);
                } else if (deleteConfirm?.type === "bulk-items") {
                  void confirmBulkDeleteItems(deleteConfirm.ids);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
