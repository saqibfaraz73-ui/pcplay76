import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import type { MenuItem, RecipeIngredient, StockUnit } from "@/db/schema";
import { STOCK_UNITS } from "@/db/schema";
import { parseNonDecimalInt } from "@/features/pos/format";

interface RecipeEditorProps {
  recipe: RecipeIngredient[];
  onChange: (recipe: RecipeIngredient[]) => void;
  allItems: MenuItem[]; // all items for ingredient selection
  currentItemId?: string; // exclude self from ingredient list
}

export function RecipeEditor({ recipe, onChange, allItems, currentItemId }: RecipeEditorProps) {
  const availableItems = allItems.filter(
    (i) => i.id !== currentItemId && i.trackInventory
  );

  const addIngredient = () => {
    if (availableItems.length === 0) return;
    const first = availableItems[0];
    onChange([
      ...recipe,
      { itemId: first.id, itemName: first.name, qty: 1, unit: first.stockUnit ?? "pcs" },
    ]);
  };

  const updateIngredient = (idx: number, updates: Partial<RecipeIngredient>) => {
    onChange(recipe.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
  };

  const removeIngredient = (idx: number) => {
    onChange(recipe.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Recipe / Ingredients</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addIngredient}
          disabled={availableItems.length === 0}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Add Ingredient
        </Button>
      </div>

      {availableItems.length === 0 && recipe.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No inventory-tracked items available. Create items with inventory tracking to use as ingredients.
        </p>
      )}

      {recipe.map((ingredient, idx) => (
        <div key={idx} className="flex items-center gap-1.5 rounded-md border p-2">
          <select
            value={ingredient.itemId}
            onChange={(e) => {
              const item = allItems.find((i) => i.id === e.target.value);
              updateIngredient(idx, {
                itemId: e.target.value,
                itemName: item?.name ?? "",
                unit: item?.stockUnit ?? "pcs",
              });
            }}
            className="h-8 flex-1 min-w-0 rounded-md border bg-background px-2 text-xs"
          >
            {availableItems.map((item) => (
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
      ))}

      {recipe.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          When this item is sold, ingredient stock will be automatically deducted.
        </p>
      )}
    </div>
  );
}
