import React from "react";
import { fmtDateTime } from "@/features/pos/format";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { db } from "@/db/appDb";
import type { InventoryAdjustment, MenuItem, Settings } from "@/db/schema";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function DatePicker(props: { label: string; date: Date; onChange: (d: Date) => void }) {
  return (
    <div className="space-y-2">
      <Label>{props.label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}> 
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(props.date, "PPP")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={props.date}
            onSelect={(d) => d && props.onChange(d)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function buildPdf(args: {
  restaurantName: string;
  from: Date;
  to: Date;
  itemName: string;
  rows: Array<{ adj: InventoryAdjustment; item: MenuItem | undefined }>;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  let y = 48;
  const line = (text: string) => {
    doc.text(text, left, y);
    y += 16;
    if (y > 780) {
      doc.addPage();
      y = 48;
    }
  };

  line(args.restaurantName);
  line("Inventory Adjustments");
  line(`Item: ${args.itemName}`);
  line(`From: ${format(args.from, "yyyy-MM-dd")}  To: ${format(args.to, "yyyy-MM-dd")}`);
  line(" ");

  for (const r of args.rows) {
    const when = fmtDateTime(r.adj.createdAt);
    const name = r.item?.name ?? r.adj.itemId;
    line(`${when}  ${name}`);
    line(`  ${r.adj.type.toUpperCase()}  delta ${r.adj.delta}  ${r.adj.before} → ${r.adj.after}`);
    if (r.adj.note) line(`  Note: ${r.adj.note}`);
  }

  return doc;
}

export function AdminInventoryAdjustments() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [rows, setRows] = React.useState<Array<{ adj: InventoryAdjustment; item: MenuItem | undefined }>>([]);
  const [currentStock, setCurrentStock] = React.useState<Record<string, number>>({});
  const [itemId, setItemId] = React.useState<string>("");
  const [from, setFrom] = React.useState<Date>(() => startOfDay(new Date()));
  const [to, setTo] = React.useState<Date>(() => endOfDay(new Date()));
  

  const refresh = React.useCallback(async () => {
    const [s, its, adjs, inv] = await Promise.all([
      db.settings.get("app"),
      db.items.orderBy("createdAt").toArray(),
      db.inventoryAdjustments.orderBy("createdAt").reverse().toArray(),
      db.inventory.toArray(),
    ]);
    setSettings(s ?? null);
    setItems(its);
    const byId = new Map(its.map((i) => [i.id, i] as const));
    setRows(adjs.map((adj) => ({ adj, item: byId.get(adj.itemId) })));
    setCurrentStock(Object.fromEntries(inv.map((r) => [r.itemId, r.quantity])));
    setItemId((prev) => prev || its.find((i) => i.trackInventory)?.id || "");
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const fromTs = startOfDay(from).getTime();
  const toTs = endOfDay(to).getTime();

  const filtered = rows
    .filter((r) => (itemId ? r.adj.itemId === itemId : true))
    .filter((r) => r.adj.createdAt >= fromTs && r.adj.createdAt <= toTs)
    .sort((a, b) => b.adj.createdAt - a.adj.createdAt);

  const buildAdjBytes = async () => {
    const itemName = itemId ? items.find((i) => i.id === itemId)?.name ?? itemId : "All items";
    const doc = buildPdf({
      restaurantName: settings?.restaurantName ?? "SANGI POS",
      from: startOfDay(from),
      to: endOfDay(to),
      itemName,
      rows: filtered,
    });
    const bytes = doc.output("arraybuffer");
    const fileName = `inventory_adjustments_${format(from, "yyyy-MM-dd")}_${format(to, "yyyy-MM-dd")}.pdf`;
    return { bytes: new Uint8Array(bytes), fileName };
  };

  const savePdf = async (overrideName?: string) => {
    try {
      const { bytes, fileName } = await buildAdjBytes();
      await savePdfBytes(bytes, overrideName ?? fileName);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const exportPdf = async () => {
    try {
      const { bytes, fileName } = await buildAdjBytes();
      await sharePdfBytes(bytes, fileName, "Inventory Adjustments");
      toast({ title: "Exported", description: fileName });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // Calculate stock added/removed summary in date range
  const stockSummary = React.useMemo(() => {
    const summary: Record<string, { added: number; removed: number; set: number; current: number; name: string }> = {};
    const relevantItems = itemId ? filtered : filtered;
    for (const r of relevantItems) {
      const id = r.adj.itemId;
      if (!summary[id]) {
        summary[id] = { added: 0, removed: 0, set: 0, current: currentStock[id] ?? 0, name: r.item?.name ?? id };
      }
      if (r.adj.type === "add") summary[id].added += r.adj.delta;
      else if (r.adj.type === "remove") summary[id].removed += r.adj.delta;
      else if (r.adj.type === "set") summary[id].set++;
    }
    return Object.entries(summary);
  }, [filtered, currentStock, itemId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Inventory History</CardTitle>
          <CardDescription>Track stock changes, additions, and removals with date range filtering.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="invAdjItem">Item</Label>
              <select
                id="invAdjItem"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All items</option>
                {items
                  .filter((i) => i.trackInventory)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </div>
            <DatePicker label="From" date={from} onChange={setFrom} />
            <DatePicker label="To" date={to} onChange={setTo} />
          </div>

          <div className="flex flex-wrap gap-2">
            <SaveShareMenu label="History PDF" getDefaultFileName={() => `inventory_history_${format(from, "yyyy-MM-dd")}_${format(to, "yyyy-MM-dd")}.pdf`} onSave={(fn) => void savePdf(fn)} onShare={() => void exportPdf()} />
            <Button variant="outline" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>

          {/* Stock Summary Card */}
          {stockSummary.length > 0 && (
            <div className="rounded-md border">
              <div className="px-3 py-2 bg-muted/40 text-xs font-medium">Stock Summary (Selected Range)</div>
              <div className="divide-y">
                {stockSummary.map(([id, s]) => (
                  <div key={id} className="flex items-center justify-between px-3 py-2 text-sm gap-2">
                    <span className="font-medium truncate flex-1">{s.name}</span>
                    <div className="flex gap-3 text-xs">
                      {s.added > 0 && <span className="text-green-600 dark:text-green-400">+{s.added} added</span>}
                      {s.removed > 0 && <span className="text-destructive">-{s.removed} removed</span>}
                      {s.set > 0 && <span className="text-muted-foreground">{s.set}x set</span>}
                      <span className="font-medium">Current: {s.current}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No adjustments found in this range.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <div key={r.adj.id} className="rounded-md border p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{r.item?.name ?? r.adj.itemId}</div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(r.adj.createdAt)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className={cn(
                      "font-medium",
                      r.adj.type === "add" ? "text-green-600 dark:text-green-400" : r.adj.type === "remove" ? "text-destructive" : ""
                    )}>
                      {r.adj.type.toUpperCase()}
                    </span>
                    {" "}• qty {r.adj.delta} • {r.adj.before} → {r.adj.after}
                    {r.adj.note ? ` • ${r.adj.note}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
