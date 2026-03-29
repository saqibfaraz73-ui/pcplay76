import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/db/appDb";
import type { MenuItem, Settings } from "@/db/schema";
import { formatIntMoney } from "@/features/pos/format";
import { Plus, Trash2, FileText, FileSpreadsheet, Search, X } from "lucide-react";
import { generateFbrInvoicePdf } from "./fbr-invoice-pdf";
import { generateFbrInvoiceExcel } from "./fbr-invoice-excel";

type InvoiceLine = {
  name: string;
  qty: number;
  unitPrice: number;
  pctCode: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function FbrInvoiceSection() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [lines, setLines] = React.useState<InvoiceLine[]>([{ name: "", qty: 1, unitPrice: 0, pctCode: "" }]);
  const [buyerNtn, setBuyerNtn] = React.useState("");
  const [buyerCnic, setBuyerCnic] = React.useState("");
  const [buyerName, setBuyerName] = React.useState("");
  const [buyerPhone, setBuyerPhone] = React.useState("");
  const [furtherTaxEnabled, setFurtherTaxEnabled] = React.useState(false);
  const [furtherTaxPercent, setFurtherTaxPercent] = React.useState(3);
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [menuItems, setMenuItems] = React.useState<MenuItem[]>([]);
  const [showMenuPicker, setShowMenuPicker] = React.useState(false);
  const [menuSearch, setMenuSearch] = React.useState("");

  React.useEffect(() => {
    db.settings.get("app").then(s => {
      setSettings(s ?? null);
      if (s) setInvoiceNo(String(Date.now()).slice(-6));
    });
    db.items.toArray().then(setMenuItems);
  }, []);

  const taxPercent = settings?.taxType === "percent" ? (settings.taxValue ?? 0) : 0;
  const currSymbol = settings?.currencySymbol || "Rs";

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const taxAmount = taxPercent > 0 ? Math.round(subtotal * taxPercent / 100) : 0;
  const furtherTax = furtherTaxEnabled ? Math.round(subtotal * furtherTaxPercent / 100) : 0;
  const grandTotal = subtotal + taxAmount + furtherTax;

  const needsBuyerNtn = grandTotal >= 100000;

  const addLine = () => setLines(p => [...p, { name: "", qty: 1, unitPrice: 0, pctCode: "" }]);
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof InvoiceLine, val: any) => {
    setLines(p => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  };
  const addFromMenu = (item: MenuItem) => {
    setLines(p => [...p, { name: item.name, qty: 1, unitPrice: item.price, pctCode: item.pctCode || "" }]);
    setShowMenuPicker(false);
    setMenuSearch("");
  };

  const filteredMenu = menuSearch
    ? menuItems.filter(m => m.name.toLowerCase().includes(menuSearch.toLowerCase()))
    : menuItems;

  const invoiceData = React.useMemo(() => ({
    invoiceNo,
    buyerNtn,
    buyerCnic,
    buyerName,
    buyerPhone,
    lines,
    subtotal,
    taxPercent,
    taxAmount,
    furtherTaxEnabled,
    furtherTaxPercent,
    furtherTax,
    grandTotal,
    createdAt: Date.now(),
  }), [invoiceNo, buyerNtn, buyerCnic, buyerName, buyerPhone, lines, subtotal, taxPercent, taxAmount, furtherTaxEnabled, furtherTaxPercent, furtherTax, grandTotal]);

  const handlePdf = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      await generateFbrInvoicePdf(invoiceData, settings);
      toast({ title: "PDF generated" });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleExcel = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      await generateFbrInvoiceExcel(invoiceData, settings);
      toast({ title: "Excel generated" });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!settings?.taxEnabled) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Enable Tax in Settings to use FBR Invoice generation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>FBR Tax Invoice</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invoice Number */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Invoice No.</Label>
            <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>

        {/* Buyer Details */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Buyer NTN {needsBuyerNtn && <span className="text-destructive">*</span>}</Label>
            <Input value={buyerNtn} onChange={e => setBuyerNtn(e.target.value)} placeholder="NTN" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Buyer CNIC</Label>
            <Input value={buyerCnic} onChange={e => setBuyerCnic(e.target.value)} placeholder="CNIC" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Buyer Name</Label>
            <Input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Name" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Buyer Phone</Label>
            <Input value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="Phone" className="h-8 text-sm" />
          </div>
        </div>

        {needsBuyerNtn && !buyerNtn && (
          <p className="text-xs text-destructive">
            ⚠ FBR requires Buyer NTN for invoices above {currSymbol} 100,000
          </p>
        )}

        {/* Further Tax */}
        <div className="flex items-center gap-2">
          <Switch checked={furtherTaxEnabled} onCheckedChange={setFurtherTaxEnabled} />
          <Label className="text-xs">Further Tax (unregistered buyer)</Label>
          {furtherTaxEnabled && (
            <Input
              type="number"
              value={furtherTaxPercent}
              onChange={e => setFurtherTaxPercent(Number(e.target.value) || 0)}
              className="h-7 w-16 text-xs"
              min={0}
            />
          )}
          {furtherTaxEnabled && <span className="text-xs text-muted-foreground">%</span>}
        </div>

        {/* Item Lines */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Items</Label>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => setShowMenuPicker(p => !p)} className="h-7 text-xs gap-1">
                <Search className="h-3 w-3" /> From Menu
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={addLine} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Manual
              </Button>
            </div>
          </div>

          {/* Menu picker */}
          {showMenuPicker && (
            <div className="border rounded-md p-2 space-y-1 max-h-48 overflow-y-auto bg-background">
              <div className="flex gap-1">
                <Input
                  placeholder="Search menu..."
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                  className="h-7 text-xs flex-1"
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setShowMenuPicker(false); setMenuSearch(""); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {filteredMenu.length === 0 && (
                <p className="text-xs text-muted-foreground p-2">No items found</p>
              )}
              {filteredMenu.slice(0, 30).map(item => (
                <button
                  key={item.id}
                  className="w-full text-left px-2 py-1 rounded hover:bg-accent text-xs"
                  onClick={() => addFromMenu(item)}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground ml-2">{currSymbol} {item.price}</span>
                  {item.pctCode ? <span className="text-muted-foreground"> · {item.pctCode}</span> : ""}
                </button>
              ))}
            </div>
          )}

          {lines.map((line, i) => (
            <div key={i} className="border rounded-md p-2 space-y-1">
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Item name"
                  value={line.name}
                  onChange={e => updateLine(i, "name", e.target.value)}
                  className="h-8 text-sm"
                />
                {lines.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeLine(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1">
                <div>
                  <Label className="text-[10px]">Qty</Label>
                  <Input type="number" value={line.qty} onChange={e => updateLine(i, "qty", Math.max(1, Number(e.target.value) || 1))} className="h-7 text-xs" min={1} />
                </div>
                <div>
                  <Label className="text-[10px]">Price ({currSymbol})</Label>
                  <Input type="number" value={line.unitPrice} onChange={e => updateLine(i, "unitPrice", Math.max(0, Number(e.target.value) || 0))} className="h-7 text-xs" min={0} />
                </div>
                <div>
                  <Label className="text-[10px]">PCT Code</Label>
                  <Input value={line.pctCode} onChange={e => updateLine(i, "pctCode", e.target.value)} className="h-7 text-xs" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                Subtotal: {formatIntMoney(line.qty * line.unitPrice)}
              </p>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="border-t pt-2 space-y-1">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span><span>{formatIntMoney(subtotal)}</span>
          </div>
          {taxPercent > 0 && (
            <div className="flex justify-between text-sm">
              <span>{settings.taxLabel || "Tax"} ({taxPercent}%)</span><span>{formatIntMoney(taxAmount)}</span>
            </div>
          )}
          {furtherTaxEnabled && (
            <div className="flex justify-between text-sm">
              <span>Further Tax ({furtherTaxPercent}%)</span><span>{formatIntMoney(furtherTax)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold border-t pt-1">
            <span>Grand Total</span><span>{formatIntMoney(grandTotal)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handlePdf} disabled={saving || lines.every(l => !l.name)} className="gap-1.5">
            <FileText className="h-4 w-4" /> Save PDF
          </Button>
          <Button onClick={handleExcel} variant="outline" disabled={saving || lines.every(l => !l.name)} className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> Save Excel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
