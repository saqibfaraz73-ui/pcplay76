import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Search, ChefHat, Save, DollarSign } from "lucide-react";
import { db } from "@/db/appDb";
import type { MenuItem, RecipeIngredient, StockUnit } from "@/db/schema";
import { STOCK_UNITS } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";

export function AdminRecipeBom() {
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

  React.useEffect(() => { load(); }, [load]);

  const compositeItems = items.filter((i) => {
    const q = search.toLowerCase();
    return i.name.toLowerCase().includes(q);
  });

  const inventoryItems = items.filter((i) => i.trackInventory);

  // Build a map of item buyingPrice for cost calculation
  const itemCostMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((i) => { map[i.id] = i.buyingPrice ?? 0; });
    return map;
  }, [items]);

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const selectItem = (item: MenuItem) => {
    if (dirty) {
      if (!confirm("You have unsaved changes. Discard?")) return;
    }
    setSelectedItemId(item.id);
    setRecipe(item.recipe ?? []);
    setMakingCost(item.recipeMakingCost ?? 0);
    setDirty(false);
  };

  const addIngredient = () => {
    const available = inventoryItems.filter(
      (i) => i.id !== selectedItemId && !recipe.some((r) => r.itemId === i.id)
    );
    if (available.length === 0) {
      toast({ title: "No more inventory items available", variant: "destructive" });
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

  // Calculate ingredient costs
  const ingredientCosts = recipe.map((r) => {
    const unitCost = itemCostMap[r.itemId] ?? 0;
    return r.qty * unitCost;
  });
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

  const availableForAdd = inventoryItems.filter(
    (i) => i.id !== selectedItemId && !recipe.some((r) => r.itemId === i.id)
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: Item list */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ChefHat className="h-4 w-4" /> Products
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {compositeItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                    selectedItemId === item.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="font-medium">{item.name}</div>
                  <div className="flex items-center gap-2 text-[10px] opacity-70">
                    {item.recipe && item.recipe.length > 0 && (
                      <span>{item.recipe.length} ingredient{item.recipe.length > 1 ? "s" : ""}</span>
                    )}
                    {item.buyingPrice ? (
                      <span>Cost: ₹{item.buyingPrice}</span>
                    ) : null}
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
                  <Label className="text-xs font-medium">Ingredients (Bill of Materials)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addIngredient}
                    disabled={availableForAdd.length === 0}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add Ingredient
                  </Button>
                </div>

                {recipe.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No ingredients added. Add inventory-tracked items with buying price to calculate recipe cost.
                  </p>
                )}

                {/* Ingredient rows */}
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
                          {inventoryItems
                            .filter((i) => i.id !== selectedItemId)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>

                        <Input
                          type="number"
                          inputMode="decimal"
                          value={ingredient.qty || ""}
                          onChange={(e) => updateIngredient(idx, { qty: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-16 text-xs px-1"
                          placeholder="Qty"
                        />

                        <select
                          value={ingredient.unit}
                          onChange={(e) => updateIngredient(idx, { unit: e.target.value as StockUnit })}
                          className="h-8 w-20 rounded-md border bg-background px-1 text-xs"
                        >
                          {STOCK_UNITS.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-destructive"
                          onClick={() => removeIngredient(idx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {/* Cost line */}
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                        <span>Unit cost: ₹{unitCost}{unitCost === 0 ? " (set buying price in Products)" : ""}</span>
                        <span className="font-medium text-foreground">₹{lineCost.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Making cost & total */}
                {recipe.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Making Cost (optional):</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={makingCost || ""}
                        onChange={(e) => { setMakingCost(parseFloat(e.target.value) || 0); setDirty(true); }}
                        className="h-8 w-24 text-xs"
                        placeholder="₹0"
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
                  <Button
                    size="sm"
                    onClick={saveRecipe}
                    disabled={!dirty}
                    className="gap-1"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Recipe
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
