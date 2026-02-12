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
import { shareFile, writePdfFile } from "@/features/files/sangi-folders";
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
  const [itemId, setItemId] = React.useState<string>("");
  const [from, setFrom] = React.useState<Date>(() => startOfDay(new Date()));
  const [to, setTo] = React.useState<Date>(() => endOfDay(new Date()));
  const [lastUri, setLastUri] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const [s, its, adjs] = await Promise.all([
      db.settings.get("app"),
      db.items.orderBy("createdAt").toArray(),
      db.inventoryAdjustments.orderBy("createdAt").reverse().toArray(),
    ]);
    setSettings(s ?? null);
    setItems(its);
    const byId = new Map(its.map((i) => [i.id, i] as const));
    setRows(adjs.map((adj) => ({ adj, item: byId.get(adj.itemId) })));
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

  const exportPdf = async () => {
    try {
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
      const saved = await writePdfFile({ folder: "Sales Report", fileName, pdfBytes: new Uint8Array(bytes) });
      setLastUri(saved.uri);
      toast({ title: "Saved", description: fileName });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Adjustments History</CardTitle>
          <CardDescription>Filter by item and date range; export to PDF for printing/sharing.</CardDescription>
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
            <Button onClick={() => void exportPdf()}>Export PDF</Button>
            <Button
              variant="outline"
              disabled={!lastUri}
              onClick={() => lastUri && void shareFile({ title: "Inventory Adjustments", uri: lastUri })}
            >
              Share Last Export
            </Button>
            <Button variant="outline" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>

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
                    {r.adj.type.toUpperCase()} • delta {r.adj.delta} • {r.adj.before} → {r.adj.after}
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
