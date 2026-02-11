import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/db/appDb";
import type { InventoryAdjustmentType, InventoryRow, MenuItem, Settings } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { parseNonDecimalInt } from "@/features/pos/format";
import { makeId } from "@/features/admin/id";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Row = {
  item: MenuItem;
  stock: number;
};

export function AdminInventory() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [activeItemId, setActiveItemId] = React.useState<string | null>(null);
  const [type, setType] = React.useState<InventoryAdjustmentType>("set");
  const [amount, setAmount] = React.useState<number>(0);
  const [note, setNote] = React.useState("");

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

  const filtered = rows.filter((r) => r.item.name.toLowerCase().includes(query.trim().toLowerCase()));

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
                      "flex items-center justify-between gap-3 rounded-md border p-2",
                      isExpired && "border-destructive bg-destructive/5",
                      isExpiringSoon && "border-yellow-500 bg-yellow-500/5"
                    )}
                  >
                    <div className="min-w-0">
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
