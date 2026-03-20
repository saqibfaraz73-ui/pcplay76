import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { db } from "@/db/appDb";
import type { InventoryAdjustmentType, InventoryRow, MenuItem, Settings } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { parseNonDecimalInt } from "@/features/pos/format";
import { makeId } from "@/features/admin/id";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";

type Row = {
  item: MenuItem;
  stock: number;
};

type SortMode = "expiry-asc" | "expiry-desc" | "stock-asc" | "stock-desc";

export function AdminInventory() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState<SortMode>("expiry-asc");
  const [open, setOpen] = React.useState(false);
  const [activeItemId, setActiveItemId] = React.useState<string | null>(null);
  const [type, setType] = React.useState<InventoryAdjustmentType>("set");
  const [amount, setAmount] = React.useState<number>(0);
  const [note, setNote] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkType, setBulkType] = React.useState<InventoryAdjustmentType>("set");
  const [bulkAmount, setBulkAmount] = React.useState<number>(0);
  const [bulkNote, setBulkNote] = React.useState("");

  const refresh = React.useCallback(async () => {
    const [items, inv] = await Promise.all([
      db.items.orderBy("createdAt").toArray(),
      db.inventory.toArray(),
    ]);
    const invById = Object.fromEntries(inv.map((r) => [r.itemId, r] as const)) as Record<string, InventoryRow>;
    const next: Row[] = items
      .filter((i) => i.trackInventory)
      .map((i) => ({ item: i, stock: invById[i.id]?.quantity ?? 0 }));
    setRows(next);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const sortedRows = React.useMemo(() => {
    const copy = [...rows];
    switch (sortMode) {
      case "expiry-asc":
        return copy.sort((a, b) => (a.item.expiryDate ?? Infinity) - (b.item.expiryDate ?? Infinity));
      case "expiry-desc":
        return copy.sort((a, b) => (b.item.expiryDate ?? 0) - (a.item.expiryDate ?? 0));
      case "stock-asc":
        return copy.sort((a, b) => a.stock - b.stock);
      case "stock-desc":
        return copy.sort((a, b) => b.stock - a.stock);
    }
  }, [rows, sortMode]);

  const filtered = sortedRows.filter((r) => r.item.name.toLowerCase().includes(query.trim().toLowerCase()));

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.item.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.item.id)));
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSave = async () => {
    if (selectedIds.size === 0) return;
    try {
      const now = Date.now();
      const delta = Math.max(0, Math.round(bulkAmount));
      await db.transaction("rw", db.inventory, db.inventoryAdjustments, async () => {
        for (const itemId of selectedIds) {
          const row = await db.inventory.get(itemId);
          const before = row?.quantity ?? 0;
          let after = before;
          if (bulkType === "set") after = delta;
          if (bulkType === "add") after = before + delta;
          if (bulkType === "remove") after = Math.max(0, before - delta);
          await db.inventory.put({ itemId, quantity: after, updatedAt: now });
          await db.inventoryAdjustments.put({
            id: makeId("invadj"),
            itemId,
            type: bulkType,
            delta,
            before,
            after,
            note: bulkNote.trim() || "Bulk update",
            createdAt: now,
          });
        }
      });
      toast({ title: `Updated ${selectedIds.size} items` });
      setBulkOpen(false);
      setSelectedIds(new Set());
      await refresh();
    } catch (e: any) {
      toast({ title: "Bulk update failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const openAdjust = (itemId: string) => {
    setActiveItemId(itemId);
    setType("set");
    setAmount(0);
    setNote("");
    setOpen(true);
  };

  const save = async () => {
    if (!activeItemId) return;
    try {
      const now = Date.now();
      const row = await db.inventory.get(activeItemId);
      const before = row?.quantity ?? 0;
      const delta = Math.max(0, Math.round(amount));
      let after = before;
      if (type === "set") after = delta;
      if (type === "add") after = before + delta;
      if (type === "remove") after = Math.max(0, before - delta);

      await db.transaction("rw", db.inventory, db.inventoryAdjustments, async () => {
        await db.inventory.put({ itemId: activeItemId, quantity: after, updatedAt: now });
        await db.inventoryAdjustments.put({
          id: makeId("invadj"),
          itemId: activeItemId,
          type,
          delta,
          before,
          after,
          note: note.trim() || undefined,
          createdAt: now,
        });
      });

      toast({ title: "Inventory updated" });
      setOpen(false);
      setActiveItemId(null);
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not update inventory", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const active = rows.find((r) => r.item.id === activeItemId)?.item;

  const sortLabels: Record<SortMode, string> = {
    "expiry-asc": "Expiry ↑ (nearest first)",
    "expiry-desc": "Expiry ↓ (farthest first)",
    "stock-asc": "Stock ↑ (low to high)",
    "stock-desc": "Stock ↓ (high to low)",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>Adjust stock for items that have inventory tracking enabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="invSearch">Search item</Label>
              <Input id="invSearch" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type item name" />
            </div>
          </div>

          {/* Sort filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {(Object.keys(sortLabels) as SortMode[]).map((k) => (
                <option key={k} value={k}>{sortLabels[k]}</option>
              ))}
            </select>
          </div>

          {/* Select all + bulk action */}
          {filtered.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleSelectAll}
                  id="selectAll"
                />
                <Label htmlFor="selectAll" className="text-sm cursor-pointer">Select All ({filtered.length})</Label>
              </div>
              {selectedIds.size > 0 && (
                <Button size="sm" onClick={() => { setBulkType("set"); setBulkAmount(0); setBulkNote(""); setBulkOpen(true); }}>
                  Bulk Update ({selectedIds.size})
                </Button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No tracked items found.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const expiryStr = r.item.expiryDate ? format(new Date(r.item.expiryDate), "dd MMM yyyy") : null;
                const isExpired = r.item.expiryDate && r.item.expiryDate < Date.now();
                const isExpiringSoon = r.item.expiryDate && !isExpired && r.item.expiryDate < Date.now() + 7 * 24 * 60 * 60 * 1000;
                return (
                  <div 
                    key={r.item.id} 
                    className={cn(
                      "flex items-center gap-3 rounded-md border p-2",
                      isExpired && "border-destructive bg-destructive/5",
                      isExpiringSoon && "border-yellow-500 bg-yellow-500/5"
                    )}
                  >
                    <Checkbox
                      checked={selectedIds.has(r.item.id)}
                      onCheckedChange={() => toggleSelect(r.item.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Stock: {r.stock}{r.item.stockUnit && r.item.stockUnit !== "pcs" ? ` ${r.item.stockUnit}` : ""}
                      </div>
                      {expiryStr && (
                        <div className={cn(
                          "text-xs",
                          isExpired ? "text-destructive font-medium" : isExpiringSoon ? "text-yellow-600 font-medium" : "text-muted-foreground"
                        )}>
                          {isExpired ? "⚠️ Expired: " : isExpiringSoon ? "⏰ Expiring: " : "Exp: "}{expiryStr}
                        </div>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openAdjust(r.item.id)}>
                      Adjust
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Inventory{active ? `: ${active.name}` : ""}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as InventoryAdjustmentType)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="set">Set</option>
                <option value="add">Add</option>
                <option value="remove">Remove</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="numeric"
                value={amount === 0 ? "" : String(amount)}
                placeholder="0"
                onChange={(e) => setAmount(parseNonDecimalInt(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / note" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void save()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
