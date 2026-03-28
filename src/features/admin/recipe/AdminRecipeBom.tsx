import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Search, ChefHat, Save, Package, History, AlertTriangle, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/db/appDb";
import type { MenuItem, RecipeIngredient, StockUnit, InventoryAdjustmentType, InventoryAdjustment } from "@/db/schema";
import { STOCK_UNITS } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";
import { fmtDateTime } from "@/features/pos/format";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function useCurrencySymbol() {
  const [sym, setSym] = React.useState("₹");
  React.useEffect(() => {
    db.settings.get("app").then((s) => {
      if (s?.currencySymbol) setSym(s.currencySymbol);
    });
  }, []);
  return sym;
}

/* ───────── Making Items Manager ───────── */

function MakingItemsManager({ onChanged, cur }: { onChanged: () => void; cur: string }) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editItem, setEditItem] = React.useState<MenuItem | null>(null);

  const [name, setName] = React.useState("");
  const [buyingPrice, setBuyingPrice] = React.useState<number>(0);
  const [stockUnit, setStockUnit] = React.useState<StockUnit>("pcs");
  const [initialStock, setInitialStock] = React.useState<number>(0);
  const [minStock, setMinStock] = React.useState<number>(0);

  const [stockMap, setStockMap] = React.useState<Record<string, number>>({});

  // Stock adjust dialog
  const [adjOpen, setAdjOpen] = React.useState(false);
  const [adjItemId, setAdjItemId] = React.useState<string>("");
  const [adjType, setAdjType] = React.useState<InventoryAdjustmentType>("add");
  const [adjAmount, setAdjAmount] = React.useState<number>(0);
  const [adjNote, setAdjNote] = React.useState("");

  const load = React.useCallback(async () => {
    const [all, inv] = await Promise.all([db.items.toArray(), db.inventory.toArray()]);
    setItems(all.filter((i) => i.isRawMaterial));
    const map: Record<string, number> = {};
    inv.forEach((r) => { map[r.itemId] = r.quantity; });
    setStockMap(map);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  // Low stock items
  const lowStockItems = items.filter((i) => {
    const stock = stockMap[i.id] ?? 0;
    return i.minStock && i.minStock > 0 && stock <= i.minStock;
  });

  const openAdd = () => {
    setEditItem(null); setName(""); setBuyingPrice(0); setStockUnit("pcs"); setInitialStock(0); setMinStock(0);
    setDialogOpen(true);
  };

  const openEdit = async (item: MenuItem) => {
    setEditItem(item); setName(item.name); setBuyingPrice(item.buyingPrice ?? 0);
    setStockUnit(item.stockUnit ?? "pcs"); setMinStock(item.minStock ?? 0);
    const inv = await db.inventory.get(item.id);
    setInitialStock(inv?.quantity ?? 0);
    setDialogOpen(true);
  };

  const openAdjust = (item: MenuItem) => {
    setAdjItemId(item.id); setAdjType("add"); setAdjAmount(0); setAdjNote("");
    setAdjOpen(true);
  };

  const saveAdjust = async () => {
    if (!adjItemId || adjAmount <= 0) return;
    const now = Date.now();
    const row = await db.inventory.get(adjItemId);
    const before = row?.quantity ?? 0;
    let after = before;
    if (adjType === "set") after = adjAmount;
    if (adjType === "add") after = before + adjAmount;
    if (adjType === "remove") after = Math.max(0, before - adjAmount);
    await db.inventory.put({ itemId: adjItemId, quantity: after, updatedAt: now });
    await db.inventoryAdjustments.put({
      id: makeId("invadj"), itemId: adjItemId, type: adjType,
      delta: adjAmount, before, after, note: adjNote.trim() || undefined, createdAt: now,
    });
    toast({ title: `Stock ${adjType}: ${before} → ${after}` });
    setAdjOpen(false);
    await load(); onChanged();
  };

  const save = async () => {
    if (!name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (editItem) {
      await db.items.update(editItem.id, {
        name: name.trim(), buyingPrice: buyingPrice || undefined, stockUnit,
        trackInventory: true, minStock: minStock > 0 ? minStock : undefined,
      });
      await db.inventory.put({ itemId: editItem.id, quantity: initialStock, updatedAt: Date.now() });
      toast({ title: "Making item updated" });
    } else {
      const id = makeId("raw");
      let rawCat = (await db.categories.toArray()).find((c) => c.name === "__raw_materials__");
      if (!rawCat) {
        rawCat = { id: makeId("cat"), name: "__raw_materials__", isActive: false, createdAt: Date.now() };
        await db.categories.put(rawCat);
      }
      await db.items.put({
        id, categoryId: rawCat.id, name: name.trim(), price: 0,
        buyingPrice: buyingPrice || undefined, trackInventory: true, stockUnit,
        isRawMaterial: true, minStock: minStock > 0 ? minStock : undefined, createdAt: Date.now(),
      });
      await db.inventory.put({ itemId: id, quantity: initialStock, updatedAt: Date.now() });
      toast({ title: "Making item added" });
    }
    setDialogOpen(false); await load(); onChanged();
  };

  const deleteItem = async (item: MenuItem) => {
    if (!confirm(`Delete "${item.name}"? Stock data will also be removed.`)) return;
    await db.items.delete(item.id); await db.inventory.delete(item.id);
    toast({ title: "Deleted" }); await load(); onChanged();
  };

  const adjItemName = items.find((i) => i.id === adjItemId)?.name ?? "";

  return (
    <div className="space-y-3">
      {/* Low stock reminder */}
      {lowStockItems.length > 0 && (
        <div className="rounded-md border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-2 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Low Stock Alert
          </div>
          {lowStockItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-xs px-1">
              <span>{item.name}</span>
              <span className="text-destructive font-medium">
                {stockMap[item.id] ?? 0} left (min: {item.minStock})
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search making items..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-7 h-8 text-xs" />
        </div>
        <Button size="sm" onClick={openAdd} className="h-8 text-xs gap-1"><Plus className="h-3 w-3" /> Add</Button>
      </div>

      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">No making items yet. Add raw materials like Buns, Cheese, Patties etc.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map((item) => {
          const stock = stockMap[item.id] ?? 0;
          const isLow = item.minStock && item.minStock > 0 && stock <= item.minStock;
          return (
            <div key={item.id} className={cn("flex items-center justify-between rounded-md border p-2 text-xs", isLow && "border-orange-400 dark:border-orange-700")}>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{item.name}</div>
                <div className="text-muted-foreground">
                  {cur}{item.buyingPrice ?? 0}/{item.stockUnit ?? "pcs"} · Stock: <span className={cn(isLow && "text-destructive font-medium")}>{stock}</span>
                  {item.minStock ? ` (min: ${item.minStock})` : ""}
                </div>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAdjust(item)} title="Adjust stock">
                  <Plus className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)} title="Edit">
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteItem(item)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">{editItem ? "Edit" : "Add"} Making Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" placeholder="e.g. Bread Bun" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Buying Price (per unit)</Label>
                <Input type="number" inputMode="decimal" value={buyingPrice || ""} onChange={(e) => setBuyingPrice(parseFloat(e.target.value) || 0)} className="h-8 text-xs" placeholder={`${cur}0`} />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <select value={stockUnit} onChange={(e) => setStockUnit(e.target.value as StockUnit)} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                  {STOCK_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Current Stock</Label>
                <Input type="number" inputMode="decimal" value={initialStock || ""} onChange={(e) => setInitialStock(parseFloat(e.target.value) || 0)} className="h-8 text-xs" placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Min Stock (reminder)</Label>
                <Input type="number" inputMode="decimal" value={minStock || ""} onChange={(e) => setMinStock(parseFloat(e.target.value) || 0)} className="h-8 text-xs" placeholder="0 = off" />
              </div>
            </div>
          </div>
          <DialogFooter><Button size="sm" onClick={save}>{editItem ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Adjust Dialog */}
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">Adjust Stock: {adjItemName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-1">
              {(["add", "remove", "set"] as InventoryAdjustmentType[]).map((t) => (
                <Button key={t} size="sm" variant={adjType === t ? "default" : "outline"} onClick={() => setAdjType(t)} className="flex-1 text-xs capitalize">
                  {t}
                </Button>
              ))}
            </div>
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input type="number" inputMode="decimal" value={adjAmount || ""} onChange={(e) => setAdjAmount(parseFloat(e.target.value) || 0)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} className="h-8 text-xs" placeholder="e.g. Purchased new stock" />
            </div>
          </div>
          <DialogFooter><Button size="sm" onClick={saveAdjust} disabled={adjAmount <= 0}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────── Making Items History ───────── */

function MakingItemsHistory({ cur }: { cur: string }) {
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [rows, setRows] = React.useState<Array<{ adj: InventoryAdjustment; item: MenuItem | undefined }>>([]);
  const [itemId, setItemId] = React.useState("");
  const [from, setFrom] = React.useState(() => format(new Date(), "yyyy-MM-dd"));
  const [to, setTo] = React.useState(() => format(new Date(), "yyyy-MM-dd"));

  const load = React.useCallback(async () => {
    const [all, adjs] = await Promise.all([
      db.items.toArray(),
      db.inventoryAdjustments.orderBy("createdAt").reverse().toArray(),
    ]);
    const rawItems = all.filter((i) => i.isRawMaterial);
    setItems(rawItems);
    const rawIds = new Set(rawItems.map((i) => i.id));
    const byId = new Map(all.map((i) => [i.id, i]));
    setRows(adjs.filter((a) => rawIds.has(a.itemId)).map((a) => ({ adj: a, item: byId.get(a.itemId) })));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const fromTs = new Date(from + "T00:00:00").getTime();
  const toTs = new Date(to + "T23:59:59.999").getTime();

  const filtered = rows
    .filter((r) => (itemId ? r.adj.itemId === itemId : true))
    .filter((r) => r.adj.createdAt >= fromTs && r.adj.createdAt <= toTs);

  // Summary
  const summary = React.useMemo(() => {
    const s: Record<string, { added: number; removed: number; sets: number; name: string }> = {};
    for (const r of filtered) {
      if (!s[r.adj.itemId]) s[r.adj.itemId] = { added: 0, removed: 0, sets: 0, name: r.item?.name ?? r.adj.itemId };
      if (r.adj.type === "add") s[r.adj.itemId].added += r.adj.delta;
      else if (r.adj.type === "remove") s[r.adj.itemId].removed += r.adj.delta;
      else s[r.adj.itemId].sets++;
    }
    return Object.entries(s);
  }, [filtered]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Making Items — Inventory History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Item</Label>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
              <option value="">All making items</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        {/* Summary */}
        {summary.length > 0 && (
          <div className="rounded-md border">
            <div className="px-3 py-1.5 bg-muted/40 text-xs font-medium">Summary</div>
            <div className="divide-y">
              {summary.map(([id, s]) => (
                <div key={id} className="flex items-center justify-between px-3 py-1.5 text-xs gap-2">
                  <span className="font-medium truncate flex-1">{s.name}</span>
                  <div className="flex gap-2">
                    {s.added > 0 && <span className="text-green-600 dark:text-green-400">+{s.added}</span>}
                    {s.removed > 0 && <span className="text-destructive">-{s.removed}</span>}
                    {s.sets > 0 && <span className="text-muted-foreground">{s.sets}x set</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History log */}
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No adjustments in this range.</p>
        ) : (
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
            {filtered.map((r) => (
              <div key={r.adj.id} className="rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{r.item?.name ?? r.adj.itemId}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtDateTime(r.adj.createdAt)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  <span className={cn("font-medium",
                    r.adj.type === "add" ? "text-green-600 dark:text-green-400" : r.adj.type === "remove" ? "text-destructive" : ""
                  )}>{r.adj.type.toUpperCase()}</span>
                  {" "}• qty {r.adj.delta} • {r.adj.before} → {r.adj.after}
                  {r.adj.note ? ` • ${r.adj.note}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────── Recipe Editor ───────── */

function RecipeEditorPanel({ onMakingItemsChanged, cur }: { onMakingItemsChanged: number; cur: string }) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [search, setSearch] = React.useState("");
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const [recipe, setRecipe] = React.useState<RecipeIngredient[]>([]);
  const [makingCost, setMakingCost] = React.useState<number>(0);
  const [dirty, setDirty] = React.useState(false);

  const load = React.useCallback(async () => {
    const all = await db.items.toArray();
    setItems(all);
  }, []);

  React.useEffect(() => { load(); }, [load, onMakingItemsChanged]);

  const products = items.filter((i) => !i.isRawMaterial);
  const compositeItems = products.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  const makingItems = items.filter((i) => i.isRawMaterial);

  const itemCostMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((i) => { map[i.id] = i.buyingPrice ?? 0; });
    return map;
  }, [items]);

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const selectItem = (item: MenuItem) => {
    if (dirty && !confirm("You have unsaved changes. Discard?")) return;
    setSelectedItemId(item.id);
    setRecipe(item.recipe ?? []);
    setMakingCost(item.recipeMakingCost ?? 0);
    setDirty(false);
  };

  const addIngredient = () => {
    const available = makingItems.filter((i) => !recipe.some((r) => r.itemId === i.id));
    if (available.length === 0) {
      toast({ title: "No more making items available. Add them in Making Items tab.", variant: "destructive" });
      return;
    }
    const first = available[0];
    setRecipe([...recipe, { itemId: first.id, itemName: first.name, qty: 1, unit: first.stockUnit ?? "pcs" }]);
    setDirty(true);
  };

  const updateIngredient = (idx: number, updates: Partial<RecipeIngredient>) => {
    setRecipe(recipe.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
    setDirty(true);
  };

  const removeIngredient = (idx: number) => {
    setRecipe(recipe.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const ingredientCosts = recipe.map((r) => r.qty * (itemCostMap[r.itemId] ?? 0));
  const totalIngredientCost = ingredientCosts.reduce((s, c) => s + c, 0);
  const totalRecipeCost = totalIngredientCost + (makingCost || 0);

  const saveRecipe = async () => {
    if (!selectedItemId) return;
    const cleaned = recipe.filter((r) => r.itemId && r.qty > 0);
    await db.items.update(selectedItemId, {
      recipe: cleaned.length > 0 ? cleaned : undefined,
      recipeMakingCost: makingCost > 0 ? makingCost : undefined,
      buyingPrice: totalRecipeCost > 0 ? Math.round(totalRecipeCost) : undefined,
    });
    setDirty(false);
    await load();
    toast({ title: "Recipe saved — buying cost updated to " + cur + Math.round(totalRecipeCost) });
  };

  const availableForAdd = makingItems.filter((i) => !recipe.some((r) => r.itemId === i.id));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><ChefHat className="h-4 w-4" /> Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-7 h-8 text-xs" />
          </div>
          <div className="max-h-[50vh] overflow-y-auto space-y-1">
            {compositeItems.map((item) => (
              <button key={item.id} onClick={() => selectItem(item)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${selectedItemId === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                <div className="font-medium">{item.name}</div>
                <div className="flex items-center gap-2 text-[10px] opacity-70">
                  {item.recipe && item.recipe.length > 0 && <span>{item.recipe.length} ingredient{item.recipe.length > 1 ? "s" : ""}</span>}
                  {item.buyingPrice ? <span>Cost: {cur}{item.buyingPrice}</span> : null}
                </div>
              </button>
            ))}
            {compositeItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No items found</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{selectedItem ? `Recipe: ${selectedItem.name}` : "Select a product"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedItem ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Select a product from the list to manage its recipe / ingredients.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Ingredients (from Making Items)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addIngredient} disabled={availableForAdd.length === 0} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add Ingredient
                </Button>
              </div>

              {makingItems.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No making items found. Go to "Making Items" tab first to add raw materials.</p>
              )}
              {recipe.length === 0 && makingItems.length > 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No ingredients added. Click "Add Ingredient" to select from making items.</p>
              )}

              {recipe.map((ingredient, idx) => {
                const unitCost = itemCostMap[ingredient.itemId] ?? 0;
                const lineCost = ingredient.qty * unitCost;
                return (
                  <div key={idx} className="rounded-md border p-2 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <select value={ingredient.itemId}
                        onChange={(e) => {
                          const item = items.find((i) => i.id === e.target.value);
                          updateIngredient(idx, { itemId: e.target.value, itemName: item?.name ?? "", unit: item?.stockUnit ?? "pcs" });
                        }}
                        className="h-8 flex-1 min-w-0 rounded-md border bg-background px-2 text-xs">
                        {makingItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <Input type="number" inputMode="decimal" value={ingredient.qty || ""} onChange={(e) => updateIngredient(idx, { qty: parseFloat(e.target.value) || 0 })} className="h-8 w-16 text-xs px-1" placeholder="Qty" />
                      <select value={ingredient.unit} onChange={(e) => updateIngredient(idx, { unit: e.target.value as StockUnit })} className="h-8 w-20 rounded-md border bg-background px-1 text-xs">
                        {STOCK_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => removeIngredient(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                      <span>Unit cost: {cur}{unitCost}{unitCost === 0 ? " (set price in Making Items)" : ""}</span>
                      <span className="font-medium text-foreground">{cur}{lineCost.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}

              {recipe.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Making Cost (optional):</Label>
                    <Input type="number" inputMode="decimal" value={makingCost || ""} onChange={(e) => { setMakingCost(parseFloat(e.target.value) || 0); setDirty(true); }} className="h-8 w-24 text-xs" placeholder={`${cur}0`} />
                  </div>
                  <div className="rounded-md bg-muted p-2 space-y-1">
                    <div className="flex justify-between text-xs"><span>Ingredients Cost:</span><span>{cur}{totalIngredientCost.toFixed(2)}</span></div>
                    {makingCost > 0 && <div className="flex justify-between text-xs"><span>Making Cost:</span><span>{cur}{makingCost.toFixed(2)}</span></div>}
                    <div className="flex justify-between text-xs font-bold border-t pt-1"><span>Total Recipe Cost (Buy Price):</span><span className="text-primary">{cur}{totalRecipeCost.toFixed(2)}</span></div>
                    {selectedItem.price > 0 && (
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Selling Price: {cur}{selectedItem.price}</span>
                        <span>Profit: {cur}{(selectedItem.price - totalRecipeCost).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Saving will auto-update the product's buying price to {cur}{Math.round(totalRecipeCost)}.</p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={saveRecipe} disabled={!dirty} className="gap-1"><Save className="h-3.5 w-3.5" /> Save Recipe</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────── Main Component ───────── */

export function AdminRecipeBom() {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const cur = useCurrencySymbol();

  return (
    <div className="space-y-4">
      <Tabs defaultValue="making-items">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="making-items" className="text-xs gap-1">
            <Package className="h-3.5 w-3.5" /> Making Items
          </TabsTrigger>
          <TabsTrigger value="recipe" className="text-xs gap-1">
            <ChefHat className="h-3.5 w-3.5" /> Recipe
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1">
            <History className="h-3.5 w-3.5" /> History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="making-items">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Making Items / Raw Materials</CardTitle>
              <p className="text-xs text-muted-foreground">Add raw materials with buying price and stock. Set min stock for low-stock reminders.</p>
            </CardHeader>
            <CardContent>
              <MakingItemsManager onChanged={() => setRefreshKey((k) => k + 1)} cur={cur} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="recipe">
          <RecipeEditorPanel onMakingItemsChanged={refreshKey} cur={cur} />
        </TabsContent>
        <TabsContent value="history">
          <MakingItemsHistory cur={cur} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
