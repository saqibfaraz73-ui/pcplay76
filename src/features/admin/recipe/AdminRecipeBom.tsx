import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Search, ChefHat, Save, Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/db/appDb";
import type { MenuItem, RecipeIngredient, StockUnit } from "@/db/schema";
import { STOCK_UNITS } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";

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

  // Form state
  const [name, setName] = React.useState("");
  const [buyingPrice, setBuyingPrice] = React.useState<number>(0);
  const [stockUnit, setStockUnit] = React.useState<StockUnit>("pcs");
  const [initialStock, setInitialStock] = React.useState<number>(0);

  const load = React.useCallback(async () => {
    const all = await db.items.toArray();
    setItems(all.filter((i) => i.isRawMaterial));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditItem(null);
    setName("");
    setBuyingPrice(0);
    setStockUnit("pcs");
    setInitialStock(0);
    setDialogOpen(true);
  };

  const openEdit = async (item: MenuItem) => {
    setEditItem(item);
    setName(item.name);
    setBuyingPrice(item.buyingPrice ?? 0);
    setStockUnit(item.stockUnit ?? "pcs");
    const inv = await db.inventory.get(item.id);
    setInitialStock(inv?.quantity ?? 0);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    if (editItem) {
      await db.items.update(editItem.id, {
        name: name.trim(),
        buyingPrice: buyingPrice || undefined,
        stockUnit,
        trackInventory: true,
      });
      await db.inventory.put({
        itemId: editItem.id,
        quantity: initialStock,
        updatedAt: Date.now(),
      });
      toast({ title: "Making item updated" });
    } else {
      const id = makeId("raw");
      // We need a categoryId — use a placeholder for raw materials
      let rawCat = (await db.categories.toArray()).find((c) => c.name === "__raw_materials__");
      if (!rawCat) {
        rawCat = { id: makeId("cat"), name: "__raw_materials__", isActive: false, createdAt: Date.now() };
        await db.categories.put(rawCat);
      }
      const newItem: MenuItem = {
        id,
        categoryId: rawCat.id,
        name: name.trim(),
        price: 0,
        buyingPrice: buyingPrice || undefined,
        trackInventory: true,
        stockUnit,
        isRawMaterial: true,
        createdAt: Date.now(),
      };
      await db.items.put(newItem);
      await db.inventory.put({ itemId: id, quantity: initialStock, updatedAt: Date.now() });
      toast({ title: "Making item added" });
    }

    setDialogOpen(false);
    await load();
    onChanged();
  };

  const deleteItem = async (item: MenuItem) => {
    if (!confirm(`Delete "${item.name}"? Stock data will also be removed.`)) return;
    await db.items.delete(item.id);
    await db.inventory.delete(item.id);
    toast({ title: "Deleted" });
    await load();
    onChanged();
  };

  // Get stock for display
  const [stockMap, setStockMap] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    db.inventory.toArray().then((inv) => {
      const map: Record<string, number> = {};
      inv.forEach((r) => { map[r.itemId] = r.quantity; });
      setStockMap(map);
    });
  }, [items]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search making items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-8 text-xs"
          />
        </div>
        <Button size="sm" onClick={openAdd} className="h-8 text-xs gap-1">
          <Plus className="h-3 w-3" /> Add Making Item
        </Button>
      </div>

      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">
          No making items yet. Add raw materials like Buns, Cheese, Patties etc.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-md border p-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{item.name}</div>
              <div className="text-muted-foreground">
                Cost: ₹{item.buyingPrice ?? 0}/{item.stockUnit ?? "pcs"} · Stock: {stockMap[item.id] ?? 0}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                <Save className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteItem(item)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{editItem ? "Edit" : "Add"} Making Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" placeholder="e.g. Bread Bun" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Buying Price (per unit)</Label>
                <Input
                  type="number" inputMode="decimal"
                  value={buyingPrice || ""} onChange={(e) => setBuyingPrice(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs" placeholder="₹0"
                />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <select
                  value={stockUnit}
                  onChange={(e) => setStockUnit(e.target.value as StockUnit)}
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                >
                  {STOCK_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Current Stock</Label>
              <Input
                type="number" inputMode="decimal"
                value={initialStock || ""} onChange={(e) => setInitialStock(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs" placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={save}>{editItem ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────── Recipe Editor ───────── */

function RecipeEditorPanel({ onMakingItemsChanged }: { onMakingItemsChanged: number }) {
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

  // Products (non-raw) for left panel
  const products = items.filter((i) => !i.isRawMaterial);
  const compositeItems = products.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  // Making items (raw materials) for ingredient selection
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
    const available = makingItems.filter(
      (i) => !recipe.some((r) => r.itemId === i.id)
    );
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
    toast({ title: "Recipe saved — buying cost updated to ₹" + Math.round(totalRecipeCost) });
  };

  const availableForAdd = makingItems.filter(
    (i) => !recipe.some((r) => r.itemId === i.id)
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Left: Product list */}
      <Card className="md:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ChefHat className="h-4 w-4" /> Products
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-7 h-8 text-xs" />
          </div>
          <div className="max-h-[50vh] overflow-y-auto space-y-1">
            {compositeItems.map((item) => (
              <button
                key={item.id}
                onClick={() => selectItem(item)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                  selectedItemId === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <div className="font-medium">{item.name}</div>
                <div className="flex items-center gap-2 text-[10px] opacity-70">
                  {item.recipe && item.recipe.length > 0 && (
                    <span>{item.recipe.length} ingredient{item.recipe.length > 1 ? "s" : ""}</span>
                  )}
                  {item.buyingPrice ? <span>Cost: ₹{item.buyingPrice}</span> : null}
                </div>
              </button>
            ))}
            {compositeItems.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No items found</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Right: Recipe editor */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {selectedItem ? `Recipe: ${selectedItem.name}` : "Select a product"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedItem ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              Select a product from the list to manage its recipe / ingredients.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Ingredients (from Making Items)</Label>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={addIngredient}
                  disabled={availableForAdd.length === 0}
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="h-3 w-3" /> Add Ingredient
                </Button>
              </div>

              {makingItems.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No making items found. Go to "Making Items" tab first to add raw materials.
                </p>
              )}

              {recipe.length === 0 && makingItems.length > 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No ingredients added. Click "Add Ingredient" to select from making items.
                </p>
              )}

              {recipe.map((ingredient, idx) => {
                const unitCost = itemCostMap[ingredient.itemId] ?? 0;
                const lineCost = ingredient.qty * unitCost;
                return (
                  <div key={idx} className="rounded-md border p-2 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={ingredient.itemId}
                        onChange={(e) => {
                          const item = items.find((i) => i.id === e.target.value);
                          updateIngredient(idx, {
                            itemId: e.target.value,
                            itemName: item?.name ?? "",
                            unit: item?.stockUnit ?? "pcs",
                          });
                        }}
                        className="h-8 flex-1 min-w-0 rounded-md border bg-background px-2 text-xs"
                      >
                        {makingItems.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>

                      <Input
                        type="number" inputMode="decimal"
                        value={ingredient.qty || ""}
                        onChange={(e) => updateIngredient(idx, { qty: parseFloat(e.target.value) || 0 })}
                        className="h-8 w-16 text-xs px-1" placeholder="Qty"
                      />

                      <select
                        value={ingredient.unit}
                        onChange={(e) => updateIngredient(idx, { unit: e.target.value as StockUnit })}
                        className="h-8 w-20 rounded-md border bg-background px-1 text-xs"
                      >
                        {STOCK_UNITS.map((u) => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </select>

                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-7 w-7 shrink-0 text-destructive"
                        onClick={() => removeIngredient(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                      <span>Unit cost: ₹{unitCost}{unitCost === 0 ? " (set price in Making Items)" : ""}</span>
                      <span className="font-medium text-foreground">₹{lineCost.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}

              {recipe.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Making Cost (optional):</Label>
                    <Input
                      type="number" inputMode="decimal"
                      value={makingCost || ""}
                      onChange={(e) => { setMakingCost(parseFloat(e.target.value) || 0); setDirty(true); }}
                      className="h-8 w-24 text-xs" placeholder="₹0"
                    />
                  </div>

                  <div className="rounded-md bg-muted p-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Ingredients Cost:</span>
                      <span>₹{totalIngredientCost.toFixed(2)}</span>
                    </div>
                    {makingCost > 0 && (
                      <div className="flex justify-between text-xs">
                        <span>Making Cost:</span>
                        <span>₹{makingCost.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-bold border-t pt-1">
                      <span>Total Recipe Cost (Buy Price):</span>
                      <span className="text-primary">₹{totalRecipeCost.toFixed(2)}</span>
                    </div>
                    {selectedItem.price > 0 && (
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Selling Price: ₹{selectedItem.price}</span>
                        <span>Profit: ₹{(selectedItem.price - totalRecipeCost).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Saving will auto-update the product's buying price to ₹{Math.round(totalRecipeCost)}.
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={saveRecipe} disabled={!dirty} className="gap-1">
                  <Save className="h-3.5 w-3.5" /> Save Recipe
                </Button>
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

  return (
    <div className="space-y-4">
      <Tabs defaultValue="making-items">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="making-items" className="text-xs gap-1">
            <Package className="h-3.5 w-3.5" /> Making Items
          </TabsTrigger>
          <TabsTrigger value="recipe" className="text-xs gap-1">
            <ChefHat className="h-3.5 w-3.5" /> Recipe
          </TabsTrigger>
        </TabsList>
        <TabsContent value="making-items">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Making Items / Raw Materials</CardTitle>
              <p className="text-xs text-muted-foreground">
                Add raw materials with buying price and stock. These will be available as ingredients in recipes.
              </p>
            </CardHeader>
            <CardContent>
              <MakingItemsManager onChanged={() => setRefreshKey((k) => k + 1)} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="recipe">
          <RecipeEditorPanel onMakingItemsChanged={refreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
