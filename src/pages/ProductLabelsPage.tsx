import React from "react";
import { db } from "@/db/appDb";
import type { MenuItem, Category, Settings } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { barcodeToDataUrl } from "@/features/labels/barcode-generator";
import { generateLabelPdf } from "@/features/labels/label-pdf";
import { printLabelsEscPos } from "@/features/labels/label-escpos";
import { isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Printer, Download, Search, Tags, CheckSquare, Square } from "lucide-react";

export default function ProductLabelsPage() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [filterCat, setFilterCat] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [printing, setPrinting] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const [cats, allItems, s] = await Promise.all([
        db.categories.toArray(),
        db.items.toArray(),
        db.settings.get("app"),
      ]);
      setCategories(cats);
      // Only show items with SKU
      setItems(allItems.filter((i) => i.sku && i.sku.trim().length > 0));
      setSettings(s ?? null);
    })();
  }, []);

  const filtered = React.useMemo(() => {
    let list = items;
    if (filterCat !== "all") list = list.filter((i) => i.categoryId === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [items, filterCat, search]);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((i) => i.id)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const selectCategory = (catId: string) => {
    const catItems = items.filter((i) => i.categoryId === catId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      catItems.forEach((i) => next.add(i.id));
      return next;
    });
  };

  const selectedItems = items.filter((i) => selectedIds.has(i.id));

  const buildLabels = () =>
    selectedItems.map((i) => ({
      name: i.name,
      sku: i.sku!,
      price: formatIntMoney(i.price),
    }));

  const handlePdfDownload = () => {
    if (selectedItems.length === 0) {
      toast({ title: "No items selected", description: "Select products to generate labels.", variant: "destructive" });
      return;
    }
    try {
      generateLabelPdf(buildLabels());
      toast({ title: "PDF Downloaded", description: `${selectedItems.length} label(s) saved.` });
    } catch (e: any) {
      toast({ title: "PDF Error", description: e.message, variant: "destructive" });
    }
  };

  const handleThermalPrint = async () => {
    if (selectedItems.length === 0) {
      toast({ title: "No items selected", description: "Select products to print labels.", variant: "destructive" });
      return;
    }
    if (!settings) {
      toast({ title: "No settings", description: "Configure printer in Admin > Printer first.", variant: "destructive" });
      return;
    }
    setPrinting(true);
    try {
      await printLabelsEscPos(buildLabels(), settings);
      toast({ title: "Printed", description: `${selectedItems.length} label(s) sent to printer.` });
    } catch (e: any) {
      toast({ title: "Print Error", description: e.message, variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Tags className="h-6 w-6" /> Product Labels
        </h1>
        <p className="text-sm text-muted-foreground">
          Generate scannable barcode labels for your products. Only items with a SKU are shown.
        </p>
      </header>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              <CheckSquare className="h-3.5 w-3.5 mr-1" /> Select All Visible
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              <Square className="h-3.5 w-3.5 mr-1" /> Deselect All
            </Button>
            {categories.map((c) => (
              <Button key={c.id} variant="ghost" size="sm" onClick={() => selectCategory(c.id)}>
                + {c.name}
              </Button>
            ))}
          </div>

          <div className="text-sm text-muted-foreground">
            {selectedIds.size} of {items.length} product(s) selected
          </div>
        </CardContent>
      </Card>

      {/* Product list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Products with SKU</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {items.length === 0
                ? "No products have a SKU. Add SKU codes in Admin > Products."
                : "No matching products found."}
            </p>
          ) : (
            <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1">
              {filtered.map((item) => {
                const checked = selectedIds.has(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      checked ? "bg-accent border-accent-foreground/20" : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleItem(item.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {formatIntMoney(item.price)}
                    </Badge>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      {selectedItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Label Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {selectedItems.slice(0, 12).map((item) => (
                <div key={item.id} className="border rounded-lg p-2 text-center space-y-1">
                  <div className="text-xs font-bold truncate">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{formatIntMoney(item.price)}</div>
                  <img
                    src={barcodeToDataUrl(item.sku!, { width: 200, height: 50 })}
                    alt={`Barcode ${item.sku}`}
                    className="w-full h-auto"
                  />
                </div>
              ))}
              {selectedItems.length > 12 && (
                <div className="border rounded-lg p-2 flex items-center justify-center text-sm text-muted-foreground">
                  +{selectedItems.length - 12} more
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handlePdfDownload} disabled={selectedIds.size === 0} className="gap-2">
          <Download className="h-4 w-4" /> Download PDF
        </Button>
        {isNativeAndroid() && (
          <Button
            onClick={handleThermalPrint}
            disabled={selectedIds.size === 0 || printing}
            variant="secondary"
            className="gap-2"
          >
            <Printer className="h-4 w-4" /> {printing ? "Printing…" : "Print on Thermal"}
          </Button>
        )}
      </div>
    </div>
  );
}
