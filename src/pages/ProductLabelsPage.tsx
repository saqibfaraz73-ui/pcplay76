import React from "react";
import { db } from "@/db/appDb";
import { canMakeSale, incrementSaleCount } from "@/features/licensing/licensing-db";
import type { MenuItem, Category, Settings } from "@/db/schema";
import { makeId } from "@/features/admin/id";
import { formatIntMoney } from "@/features/pos/format";
import { barcodeToDataUrl } from "@/features/labels/barcode-generator";
import { generateLabelPdf } from "@/features/labels/label-pdf";
import { jsPDF } from "jspdf";
import { printLabelsEscPos } from "@/features/labels/label-escpos";
import { downloadLabelsZpl } from "@/features/labels/label-zpl";
import { downloadLabelsTspl } from "@/features/labels/label-tspl";
import { isNativeAndroid } from "@/features/pos/bluetooth-printer";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Printer, Download, Search, Tags, CheckSquare, Square,
  Upload, Plus, Trash2, Pencil, Save,
} from "lucide-react";

/* ── Label item type used across all tabs ── */
type LabelItem = {
  id: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
  fromDb?: boolean; // true = existing product
};

/* ── SKU generator ── */
function generateSku(name: string): string {
  const prefix = name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w.slice(0, 3).toUpperCase())
    .join("");
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return (prefix || "ITM") + "-" + rand;
}

export default function ProductLabelsPage() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [allItems, setAllItems] = React.useState<MenuItem[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);

  // Label items from all sources
  const [labelItems, setLabelItems] = React.useState<LabelItem[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editSku, setEditSku] = React.useState("");

  // Menu selection
  const [filterCat, setFilterCat] = React.useState("all");
  const [search, setSearch] = React.useState("");

  // Manual entry
  const [manualName, setManualName] = React.useState("");
  const [manualPrice, setManualPrice] = React.useState("");

  // Upload
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Printing
  const [printing, setPrinting] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const [cats, items, s] = await Promise.all([
        db.categories.toArray(),
        db.items.toArray(),
        db.settings.get("app"),
      ]);
      setCategories(cats);
      setAllItems(items);
      setSettings(s ?? null);
    })();
  }, []);

  /* ── Menu tab: filtered items ── */
  const menuFiltered = React.useMemo(() => {
    let list = allItems;
    if (filterCat !== "all") list = list.filter((i) => i.categoryId === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [allItems, filterCat, search]);

  const addFromMenu = (item: MenuItem) => {
    if (labelItems.some((l) => l.id === item.id)) return;
    const sku = item.sku && item.sku.trim() ? item.sku : generateSku(item.name);
    setLabelItems((prev) => [...prev, { id: item.id, name: item.name, sku, price: item.price, qty: 1, fromDb: true }]);
  };

  const addAllVisible = () => {
    const newItems: LabelItem[] = [];
    for (const item of menuFiltered) {
      if (labelItems.some((l) => l.id === item.id)) continue;
      const sku = item.sku && item.sku.trim() ? item.sku : generateSku(item.name);
      newItems.push({ id: item.id, name: item.name, sku, price: item.price, qty: 1, fromDb: true });
    }
    setLabelItems((prev) => [...prev, ...newItems]);
  };

  const addCategoryItems = (catId: string) => {
    const catItems = allItems.filter((i) => i.categoryId === catId);
    const newItems: LabelItem[] = [];
    for (const item of catItems) {
      if (labelItems.some((l) => l.id === item.id)) continue;
      const sku = item.sku && item.sku.trim() ? item.sku : generateSku(item.name);
      newItems.push({ id: item.id, name: item.name, sku, price: item.price, qty: 1, fromDb: true });
    }
    setLabelItems((prev) => [...prev, ...newItems]);
  };

  /* ── Manual entry ── */
  const addManualItem = () => {
    const name = manualName.trim();
    if (!name) return;
    const price = parseInt(manualPrice || "0", 10) || 0;
    const sku = generateSku(name);
    setLabelItems((prev) => [...prev, { id: makeId("lbl"), name, sku, price, qty: 1, fromDb: false }]);
    setManualName("");
    setManualPrice("");
  };

  /* ── File upload (Excel / CSV / PDF text extraction) ── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      if (ext === "xlsx" || ext === "xls" || ext === "csv") {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        // Skip header row, look for columns: Name, Price, SKU (flexible)
        if (rows.length < 2) {
          toast({ title: "Empty file", description: "No data rows found.", variant: "destructive" });
          return;
        }

        const header = rows[0].map((h) => String(h ?? "").toLowerCase().trim());
        const nameCol = header.findIndex((h) => h.includes("name") || h.includes("item") || h.includes("product"));
        const priceCol = header.findIndex((h) => h.includes("price") || h.includes("selling"));
        const skuCol = header.findIndex((h) => h.includes("sku") || h.includes("barcode") || h.includes("code"));

        if (nameCol === -1) {
          toast({ title: "Missing column", description: "Could not find a 'Name' or 'Item' column in the file.", variant: "destructive" });
          return;
        }

        const newItems: LabelItem[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const name = String(row[nameCol] ?? "").trim();
          if (!name) continue;
          const price = priceCol >= 0 ? (parseInt(String(row[priceCol] ?? "0"), 10) || 0) : 0;
          const existingSku = skuCol >= 0 ? String(row[skuCol] ?? "").trim() : "";
          const sku = existingSku || generateSku(name);
          newItems.push({ id: makeId("lbl"), name, sku, price, qty: 1, fromDb: false });
        }

        setLabelItems((prev) => [...prev, ...newItems]);
        toast({ title: "Imported", description: `${newItems.length} item(s) loaded from ${file.name}` });
      } else if (ext === "pdf") {
        // Basic PDF text extraction — read as text (works for text-based PDFs)
        const text = await file.text();
        // Try to extract lines that look like product names
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 2 && l.length < 100 && !/^[\d\s.,%$]+$/.test(l));

        if (lines.length === 0) {
          toast({ title: "No items found", description: "Could not extract product names from this PDF. Try Excel format instead.", variant: "destructive" });
          return;
        }

        const newItems: LabelItem[] = lines.slice(0, 200).map((name) => ({
          id: makeId("lbl"),
          name,
          sku: generateSku(name),
          price: 0,
          qty: 1,
          fromDb: false,
        }));

        setLabelItems((prev) => [...prev, ...newItems]);
        toast({ title: "Imported from PDF", description: `${newItems.length} item(s) extracted. Review and edit as needed.` });
      } else {
        toast({ title: "Unsupported format", description: "Please upload .xlsx, .csv, or .pdf files.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Upload error", description: err.message, variant: "destructive" });
    }
  };

  /* ── Edit / remove items ── */
  const removeItem = (id: string) => setLabelItems((prev) => prev.filter((l) => l.id !== id));
  const clearAll = () => setLabelItems([]);

  const startEditSku = (item: LabelItem) => {
    setEditingId(item.id);
    setEditSku(item.sku);
  };

  const saveSku = () => {
    if (!editingId || !editSku.trim()) return;
    setLabelItems((prev) =>
      prev.map((l) => (l.id === editingId ? { ...l, sku: editSku.trim() } : l))
    );
    setEditingId(null);
    setEditSku("");
  };

  /* ── Save to products ── */
  const [saving, setSaving] = React.useState(false);
  const saveToProducts = async () => {
    const unsaved = labelItems.filter((l) => !l.fromDb);
    if (unsaved.length === 0) {
      toast({ title: "Nothing to save", description: "All items are already in the product catalog." });
      return;
    }
    setSaving(true);
    try {
      // Get or create a default category
      let defaultCat = (await db.categories.toArray())[0];
      if (!defaultCat) {
        defaultCat = { id: makeId("cat"), name: "General", createdAt: Date.now() };
        await db.categories.put(defaultCat);
      }
      const now = Date.now();
      for (const item of unsaved) {
        const newItem: MenuItem = {
          id: makeId("item"),
          categoryId: defaultCat.id,
          name: item.name,
          sku: item.sku,
          price: item.price,
          trackInventory: false,
          createdAt: now,
        };
        await db.items.put(newItem);
      }
      // Mark as saved
      setLabelItems((prev) =>
        prev.map((l) => (unsaved.some((u) => u.id === l.id) ? { ...l, fromDb: true } : l))
      );
      toast({ title: "Saved", description: `${unsaved.length} item(s) added to product catalog.` });
    } catch (err: any) {
      toast({ title: "Save error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /* ── Print / Download ── */
  const buildLabels = () => {
    const result: { name: string; sku: string; price: string }[] = [];
    for (const i of labelItems) {
      const label = { name: i.name, sku: i.sku, price: formatIntMoney(i.price) };
      for (let q = 0; q < (i.qty || 1); q++) result.push(label);
    }
    return result;
  };

  const updateQty = (id: string, qty: number) => {
    setLabelItems((prev) => prev.map((l) => l.id === id ? { ...l, qty: Math.max(1, qty) } : l));
  };

  const totalLabels = labelItems.reduce((s, l) => s + (l.qty || 1), 0);

  const handlePrintLabels = async () => {
    if (labelItems.length === 0) {
      toast({ title: "No items", description: "Add items to print labels.", variant: "destructive" });
      return;
    }
    const check = await canMakeSale("labelPrint");
    if (!check.allowed) {
      toast({ title: "Limit reached", description: check.message, variant: "destructive" });
      return;
    }
    const labels = buildLabels();
    const labelHtml = labels.map((l) => {
      const barcodeUrl = barcodeToDataUrl(l.sku, { width: 200, height: 50 });
      return `<div class="label">
        <div style="font-weight:bold;font-size:14px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.name}</div>
        ${l.price !== "Rs 0" ? `<div style="font-size:12px;color:#666;margin-bottom:4px;">${l.price}</div>` : ""}
        <img src="${barcodeUrl}" style="width:200px;height:auto;" />
        <div style="font-size:10px;color:#999;margin-top:3px;">${l.sku}</div>
      </div>`;
    }).join("");

    const htmlContent = `<!DOCTYPE html><html><head><title>Labels</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{font-family:sans-serif;height:auto !important;overflow:visible;}
        .label{page-break-after:always;display:flex;flex-direction:column;align-items:center;text-align:center;padding:8px 10px;}
        .label:last-child{page-break-after:auto;}
        @page{size:auto;margin:5mm;}
        @media print{html,body{height:auto !important;}}
      </style></head>
      <body>${labelHtml}</body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.width = "800px";
    iframe.style.height = "600px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      toast({ title: "Print error", description: "Could not create print frame.", variant: "destructive" });
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Wait for images to load then print
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        incrementSaleCount("labelPrint");
      } catch {
        toast({ title: "Print error", description: "Could not open print dialog.", variant: "destructive" });
      }
      setTimeout(() => document.body.removeChild(iframe), 60000);
    }, 500);
  };

  const handlePdfDownload = async () => {
    if (labelItems.length === 0) {
      toast({ title: "No items", description: "Add items to generate labels.", variant: "destructive" });
      return;
    }
    const check = await canMakeSale("labelPrint");
    if (!check.allowed) {
      toast({ title: "Limit reached", description: check.message, variant: "destructive" });
      return;
    }
    try {
      generateLabelPdf(buildLabels());
      await incrementSaleCount("labelPrint");
      toast({ title: "PDF Downloaded", description: `${labelItems.length} label(s) saved.` });
    } catch (e: any) {
      toast({ title: "PDF Error", description: e.message, variant: "destructive" });
    }
  };

  const handleThermalPrint = async () => {
    if (labelItems.length === 0) {
      toast({ title: "No items", description: "Add items to print labels.", variant: "destructive" });
      return;
    }
    const check = await canMakeSale("labelPrint");
    if (!check.allowed) {
      toast({ title: "Limit reached", description: check.message, variant: "destructive" });
      return;
    }
    if (!settings) {
      toast({ title: "No settings", description: "Configure printer in Admin > Printer first.", variant: "destructive" });
      return;
    }
    setPrinting(true);
    try {
      await printLabelsEscPos(buildLabels(), settings);
      await incrementSaleCount("labelPrint");
      toast({ title: "Printed", description: `${labelItems.length} label(s) sent to printer.` });
    } catch (e: any) {
      toast({ title: "Print Error", description: e.message, variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const isInList = (id: string) => labelItems.some((l) => l.id === id);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Tags className="h-6 w-6" /> Print Barcodes
        </h1>
        <p className="text-sm text-muted-foreground">
          Select products, upload a file, or add manually — SKUs & barcodes are auto-generated.
        </p>
      </header>

      {/* ── Source tabs ── */}
      <Tabs defaultValue="menu" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="menu">From Menu</TabsTrigger>
          <TabsTrigger value="upload">Upload File</TabsTrigger>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
        </TabsList>

        {/* ── Tab: From Menu ── */}
        <TabsContent value="menu" className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent className="bg-background border z-50">
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product dropdown selector */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Select Product</label>
              <Select
                value=""
                onValueChange={(val) => {
                  const item = allItems.find((i) => i.id === val);
                  if (item) addFromMenu(item);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a product to add…" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50 max-h-[300px]">
                  {menuFiltered.map((item) => {
                    const added = isInList(item.id);
                    return (
                      <SelectItem key={item.id} value={item.id} disabled={added}>
                        {item.name} — {formatIntMoney(item.price)} {added ? "(added)" : ""}
                      </SelectItem>
                    );
                  })}
                  {menuFiltered.length === 0 && (
                    <SelectItem value="__none" disabled>No products found</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={addAllVisible}>
              <CheckSquare className="h-3.5 w-3.5 mr-1" /> Add All Visible
            </Button>
            {categories.map((c) => (
              <Button key={c.id} variant="ghost" size="sm" onClick={() => addCategoryItems(c.id)}>
                + {c.name}
              </Button>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab: Upload File ── */}
        <TabsContent value="upload" className="space-y-3">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Upload an <strong>Excel (.xlsx, .csv)</strong> or <strong>PDF</strong> file with product names.
                The file should have columns like: <code>Name</code>, <code>Price</code>, <code>SKU</code> (optional).
                SKUs will be auto-generated for items without one.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" /> Choose File
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Manual Entry ── */}
        <TabsContent value="manual" className="space-y-3">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Type a product name and optional price. A unique SKU barcode will be generated automatically.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Product name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && addManualItem()}
                />
                <Input
                  placeholder="Price"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value.replace(/\D/g, ""))}
                  className="w-24"
                  onKeyDown={(e) => e.key === "Enter" && addManualItem()}
                />
                <Button onClick={addManualItem} disabled={!manualName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Selected items list ── */}
      {labelItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Label Queue ({labelItems.length} items, {totalLabels} labels to print)</CardTitle>
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
              {labelItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.name}</div>
                    {editingId === item.id ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          value={editSku}
                          onChange={(e) => setEditSku(e.target.value)}
                          className="h-7 text-xs w-40"
                          onKeyDown={(e) => e.key === "Enter" && saveSku()}
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveSku}>
                          <Save className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">SKU: {item.sku}</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => startEditSku(item)}>
                          <Pencil className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {item.price > 0 && (
                    <Badge variant="secondary" className="text-xs shrink-0">{formatIntMoney(item.price)}</Badge>
                  )}
                  {!item.fromDb && (
                    <Badge variant="outline" className="text-xs shrink-0">New</Badge>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground mr-1 hidden sm:inline">Labels:</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, (item.qty || 1) - 1)}>
                      <span className="text-sm font-bold">−</span>
                    </Button>
                    <Input
                      value={item.qty || 1}
                      onChange={(e) => updateQty(item.id, parseInt(e.target.value) || 1)}
                      className="h-7 w-12 text-center text-xs px-1"
                    />
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, (item.qty || 1) + 1)}>
                      <span className="text-sm font-bold">+</span>
                    </Button>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Barcode Preview ── */}
      {labelItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Barcode Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {labelItems.slice(0, 12).map((item) => (
                <div key={item.id} className="border rounded-lg p-2 text-center space-y-1">
                  <div className="text-xs font-bold truncate">{item.name}</div>
                  {item.price > 0 && <div className="text-xs text-muted-foreground">{formatIntMoney(item.price)}</div>}
                  <img
                    src={barcodeToDataUrl(item.sku, { width: 200, height: 50 })}
                    alt={`Barcode ${item.sku}`}
                    className="w-full h-auto"
                  />
                </div>
              ))}
              {labelItems.length > 12 && (
                <div className="border rounded-lg p-2 flex items-center justify-center text-sm text-muted-foreground">
                  +{labelItems.length - 12} more
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Actions ── */}
      {labelItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Print / Download</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose the format that matches your printer type.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handlePrintLabels} className="gap-2">
                <Printer className="h-4 w-4" /> Print Labels
              </Button>
              <Button onClick={handlePdfDownload} variant="secondary" className="gap-2">
                <Download className="h-4 w-4" /> Download A4 PDF
              </Button>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => downloadLabelsZpl(buildLabels())} variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Download ZPL (Zebra)
              </Button>
              <Button onClick={() => downloadLabelsTspl(buildLabels())} variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Download TSPL (TSC/Xprinter)
              </Button>
              {isNativeAndroid() && (
                <Button onClick={handleThermalPrint} disabled={printing} variant="outline" className="gap-2">
                  <Printer className="h-4 w-4" /> {printing ? "Printing…" : "ESC/POS Thermal"}
                </Button>
              )}
            </div>
            {labelItems.some((l) => !l.fromDb) && (
              <div className="pt-2 border-t">
                <Button onClick={saveToProducts} disabled={saving} variant="outline" className="gap-2">
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save New Items to Products"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
