import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";
import { parseNonDecimalInt } from "@/features/pos/format";
import { db } from "@/db/appDb";
import type { MenuItem } from "@/db/schema";
import type { InstallmentCustomer, InstallmentCustomerField, ProfitType, InstallmentFrequency } from "@/db/installment-schema";
import { Plus, Trash2, ImagePlus, Search } from "lucide-react";

interface Props {
  open: boolean;
  customer?: InstallmentCustomer;
  onClose: () => void;
  onSave: (c: InstallmentCustomer) => void;
}

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 800;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = (h / w) * max; w = max; }
          else { w = (w / h) * max; h = max; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function InstallmentCustomerForm({ open, customer, onClose, onSave }: Props) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [productName, setProductName] = React.useState("");
  const [marketPrice, setMarketPrice] = React.useState(0);
  const [profitType, setProfitType] = React.useState<ProfitType>("percent");
  const [profitValue, setProfitValue] = React.useState(0);
  const [tenureMonths, setTenureMonths] = React.useState(12);
  const [tenureUnit, setTenureUnit] = React.useState<"months" | "years">("months");
  const [dueDate, setDueDate] = React.useState(0);
  const [lateFeePerDay, setLateFeePerDay] = React.useState(0);
  const [customFields, setCustomFields] = React.useState<InstallmentCustomerField[]>([]);
  const [images, setImages] = React.useState<string[]>([]);
  const [frequency, setFrequency] = React.useState<InstallmentFrequency>("monthly");
  const [allItems, setAllItems] = React.useState<MenuItem[]>([]);
  const [itemQuery, setItemQuery] = React.useState("");
  const [showItemPicker, setShowItemPicker] = React.useState(false);

  // Load items for product picker
  React.useEffect(() => {
    db.items.toArray().then(setAllItems).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (open) {
      if (customer) {
        setName(customer.name);
        setPhone(customer.phone);
        setAddress(customer.address ?? "");
        setWhatsapp(customer.whatsapp ?? "");
        setEmail(customer.email ?? "");
        setProductName(customer.productName);
        setMarketPrice(customer.marketPrice ?? 0);
        setProfitType(customer.profitType);
        setProfitValue(customer.profitValue);
        setTenureMonths(customer.tenureMonths);
        setTenureUnit("months");
        setDueDate(customer.dueDate ?? 0);
        setLateFeePerDay(customer.lateFeePerDay ?? 0);
        setFrequency(customer.frequency ?? "monthly");
        setCustomFields(customer.customFields ?? []);
        setImages(customer.images ?? []);
      } else {
        setName(""); setPhone(""); setAddress(""); setWhatsapp(""); setEmail("");
        setProductName(""); setMarketPrice(0); setProfitType("percent"); setProfitValue(0);
        setTenureMonths(12); setTenureUnit("months"); setDueDate(0); setLateFeePerDay(0);
        setCustomFields([]); setImages([]);
      }
    }
  }, [open, customer]);

  const actualTenureMonths = tenureUnit === "years" ? tenureMonths * 12 : tenureMonths;
  const totalPrice = profitType === "percent"
    ? Math.round(marketPrice * (1 + profitValue / 100))
    : marketPrice + profitValue;
  const monthlyInstallment = actualTenureMonths > 0 ? Math.round(totalPrice / actualTenureMonths) : totalPrice;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    try {
      const newImages: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImage(files[i]);
        newImages.push(compressed);
      }
      setImages(prev => [...prev, ...newImages]);
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!name.trim()) { toast({ title: "Customer name is required", variant: "destructive" }); return; }
    if (!phone.trim()) { toast({ title: "Phone is required", variant: "destructive" }); return; }
    if (!productName.trim()) { toast({ title: "Product name is required", variant: "destructive" }); return; }
    if (actualTenureMonths <= 0) { toast({ title: "Tenure must be > 0", variant: "destructive" }); return; }

    const now = Date.now();
    const result: InstallmentCustomer = {
      id: customer?.id ?? makeId("inst"),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      email: email.trim() || undefined,
      customFields: customFields.filter(f => f.name.trim()),
      images,
      productName: productName.trim(),
      marketPrice: marketPrice || undefined,
      profitType,
      profitValue,
      tenureMonths: actualTenureMonths,
      monthlyInstallment,
      totalPrice,
      totalBalance: customer?.totalBalance ?? totalPrice, // keep existing balance on edit
      dueDate: dueDate > 0 ? dueDate : undefined,
      lateFeePerDay: lateFeePerDay > 0 ? lateFeePerDay : undefined,
      agentId: customer?.agentId,
      agentName: customer?.agentName,
      agentCommissionType: customer?.agentCommissionType,
      agentCommissionValue: customer?.agentCommissionValue,
      createdAt: customer?.createdAt ?? now,
    };
    // If this is a new customer or product changed, recalculate balance
    if (!customer) {
      result.totalBalance = totalPrice;
    }
    onSave(result);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "New Installment Customer"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          {/* Customer details */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Customer Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <Label>Phone *</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="03001234567" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Address (optional)</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>WhatsApp (optional)</Label>
              <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} inputMode="tel" placeholder="+923001234567" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Email (optional)</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
          </div>

          {/* Product details */}
          <div className="border-t pt-3 mt-1">
            <div className="text-sm font-semibold mb-2">Product & Installment</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 relative">
                <Label>Product Name *</Label>
                <div className="flex gap-1">
                  <Input value={productName} onChange={e => { setProductName(e.target.value); setShowItemPicker(false); }} className="flex-1" />
                  <Button type="button" size="icon" variant="outline" onClick={() => setShowItemPicker(v => !v)} title="Select from items">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                {showItemPicker && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    <div className="p-2">
                      <Input
                        value={itemQuery}
                        onChange={e => setItemQuery(e.target.value)}
                        placeholder="Search items..."
                        autoFocus
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="px-1 pb-1">
                      {allItems
                        .filter(it => !itemQuery || it.name.toLowerCase().includes(itemQuery.toLowerCase()) || (it.sku ?? "").toLowerCase().includes(itemQuery.toLowerCase()))
                        .slice(0, 20)
                        .map(it => (
                          <button
                            key={it.id}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded-sm flex justify-between"
                            onClick={() => {
                              setProductName(it.name);
                              setMarketPrice(it.price);
                              setShowItemPicker(false);
                              setItemQuery("");
                            }}
                          >
                            <span className="truncate">{it.name}</span>
                            <span className="text-muted-foreground ml-2 shrink-0">{it.price.toLocaleString()}</span>
                          </button>
                        ))
                      }
                      {allItems.filter(it => !itemQuery || it.name.toLowerCase().includes(itemQuery.toLowerCase())).length === 0 && (
                        <div className="text-xs text-muted-foreground text-center py-2">No items found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>Market Price (optional)</Label>
                <Input value={marketPrice || ""} onChange={e => setMarketPrice(parseNonDecimalInt(e.target.value))} inputMode="numeric" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 mt-3">
              <div className="space-y-1">
                <Label>Profit Type</Label>
                <select value={profitType} onChange={e => setProfitType(e.target.value as ProfitType)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Profit Value</Label>
                <Input value={profitValue || ""} onChange={e => setProfitValue(parseNonDecimalInt(e.target.value))} inputMode="numeric" placeholder={profitType === "percent" ? "e.g. 20" : "e.g. 5000"} />
              </div>
              <div className="space-y-1">
                <Label>Tenure</Label>
                <div className="flex gap-1">
                  <Input value={tenureMonths || ""} onChange={e => setTenureMonths(parseNonDecimalInt(e.target.value))} inputMode="numeric" className="flex-1" placeholder="12" />
                  <select value={tenureUnit} onChange={e => setTenureUnit(e.target.value as "months" | "years")} className="h-10 rounded-md border bg-background px-2 text-sm">
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Auto-calculated preview */}
            <div className="mt-3 rounded-md bg-muted/50 p-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Total Price</div>
                <div className="font-bold text-sm">{totalPrice.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Monthly</div>
                <div className="font-bold text-sm">{monthlyInstallment.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Tenure</div>
                <div className="font-bold text-sm">{actualTenureMonths} months</div>
              </div>
            </div>
          </div>

          {/* Due date & late fee */}
          <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
            <div className="space-y-1">
              <Label>Due Date (day of month, optional)</Label>
              <Input value={dueDate || ""} onChange={e => setDueDate(Math.min(28, parseNonDecimalInt(e.target.value)))} inputMode="numeric" placeholder="e.g. 15" />
            </div>
            <div className="space-y-1">
              <Label>Late Fee / Day (optional)</Label>
              <Input value={lateFeePerDay || ""} onChange={e => setLateFeePerDay(parseNonDecimalInt(e.target.value))} inputMode="numeric" placeholder="e.g. 50" />
            </div>
          </div>

          {/* Custom fields */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Custom Fields</span>
              <Button size="sm" variant="ghost" onClick={() => setCustomFields(prev => [...prev, { name: "", value: "" }])}>
                <Plus className="h-3 w-3 mr-1" /> Add Field
              </Button>
            </div>
            {customFields.map((f, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input value={f.name} onChange={e => { const next = [...customFields]; next[i] = { ...f, name: e.target.value }; setCustomFields(next); }} placeholder="Field name" className="flex-1" />
                <Input value={f.value} onChange={e => { const next = [...customFields]; next[i] = { ...f, value: e.target.value }; setCustomFields(next); }} placeholder="Value" className="flex-1" />
                <Button size="icon" variant="ghost" onClick={() => setCustomFields(prev => prev.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>

          {/* Images */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Images & Documents</span>
              <Button size="sm" variant="ghost" asChild>
                <label className="cursor-pointer"><ImagePlus className="h-3 w-3 mr-1" /> Add Images
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                </label>
              </Button>
            </div>
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img} alt={`img-${i}`} className="h-20 w-20 rounded border object-cover" />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeImage(i)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
