import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Upload, Printer, Share2, Plus, Trash2, Eye, ImageIcon, Download } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { isNativeAndroid } from "@/features/pos/bluetooth-printer";
import { db } from "@/db/appDb";
import type { Settings } from "@/db/schema";
import { sendToDefaultPrinter } from "@/features/pos/printer-routing";
import { canMakeSale, incrementSaleCount } from "@/features/licensing/licensing-db";
import { AdRewardDialog } from "@/features/licensing/AdRewardDialog";
import { sharePdfBlob, shareFileBlob, savePdfBlob, saveFileBlob } from "@/features/pos/share-utils";
import { Switch } from "@/components/ui/switch";
import { calcGlobalTax, getTaxLabel } from "@/features/tax/tax-calc";
import { formatIntMoney } from "@/features/pos/format";

interface ReceiptLine {
  id: string;
  label: string;
  value: string;
}

/** Convert a blob URL or object URL to a base64 data URL */
async function blobUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function CustomPrintPage({ embedded }: { embedded?: boolean }) {
  // Custom receipt builder state
  const [title, setTitle] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [billNo, setBillNo] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([
    { id: crypto.randomUUID(), label: "Item", value: "" },
  ]);

  // Tax state
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Load settings
  React.useEffect(() => {
    db.settings.get("app").then(s => setSettings(s ?? null));
  }, []);

  // Calculate tax from line values
  const linesTotal = lines.reduce((s, l) => s + (Number(l.value) || 0), 0);
  const taxAmount = taxEnabled ? calcGlobalTax(linesTotal, settings) : 0;

  // Logo state – store base64 data URL for PDF compatibility
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Uploaded file state
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedFileType, setUploadedFileType] = useState<"pdf" | "image" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [adMsg, setAdMsg] = useState("");
  const [adNeedsOnlineCheck, setAdNeedsOnlineCheck] = useState(false);
  const [pendingPrintAction, setPendingPrintAction] = useState<"print" | "share" | "uploadPrint" | null>(null);

  /* ---------- Custom receipt helpers ---------- */

  const addLine = () => {
    setLines((prev) => [...prev, { id: crypto.randomUUID(), label: "", value: "" }]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: "label" | "value", val: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Convert to base64 data URL so it works in PDF and preview
    const reader = new FileReader();
    reader.onloadend = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const buildReceiptPdf = async (): Promise<jsPDF> => {
    const doc = new jsPDF({ unit: "mm", format: [80, 150] });
    let y = 8;

    // Logo – logoUrl is already base64 data URL
    if (logoUrl) {
      try {
        doc.addImage(logoUrl, "JPEG", 25, y, 30, 15);
        y += 18;
      } catch { /* skip logo on error */ }
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    if (businessName) {
      doc.text(businessName, 40, y, { align: "center" });
      y += 6;
    }

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleString(), 40, y, { align: "center" });
    y += 4;

    if (title) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(title, 40, y, { align: "center" });
      y += 5;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    if (billNo) { doc.text(`Bill #: ${billNo}`, 40, y, { align: "center" }); y += 4; }
    if (preparedBy) { doc.text(`Prepared By: ${preparedBy}`, 40, y, { align: "center" }); y += 4; }
    if (paymentMethod) { doc.text(`Payment: ${paymentMethod}`, 40, y, { align: "center" }); y += 4; }

    doc.setLineWidth(0.3);
    doc.line(4, y, 76, y);
    y += 4;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    for (const line of lines) {
      if (!line.label && !line.value) continue;
      doc.text(line.label || "", 4, y);
      if (line.value) doc.text(line.value, 76, y, { align: "right" });
      y += 4;
    }

    // Tax line
    if (taxAmount > 0) {
      doc.setLineWidth(0.2);
      doc.line(4, y, 76, y);
      y += 4;
      doc.text(`${getTaxLabel(settings)}:`, 4, y);
      doc.text(formatIntMoney(taxAmount), 76, y, { align: "right" });
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.text("Total:", 4, y);
      doc.text(formatIntMoney(linesTotal + taxAmount), 76, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 4;
    }

      y += 2;
      doc.line(4, y, 76, y);
      y += 4;
      doc.setFontSize(7);
      const splitNote = doc.splitTextToSize(note, 68);
      doc.text(splitNote, 4, y);
      y += splitNote.length * 3;
    }

    return doc;
  };

  const previewReceipt = () => {
    setShowPreview(true);
  };

  /** Convert a base64 data URL image to ESC/POS raster commands */
  const buildLogoEscPos = async (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 240;
        const MAX_H = 80;
        let scale = Math.min(1, MAX_W / img.width);
        let w = Math.floor(img.width * scale);
        let h = Math.floor(img.height * scale);
        if (h > MAX_H) {
          const hs = MAX_H / h;
          w = Math.floor(w * hs);
          h = MAX_H;
        }
        w = Math.floor(w / 8) * 8;
        if (w < 8) w = 8;

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const pixels = imgData.data;
        const bytesPerRow = Math.ceil(w / 8);
        const bitmap = new Uint8Array(bytesPerRow * h);

        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w; col++) {
            const idx = (row * w + col) * 4;
            const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
            if (pixels[idx + 3] > 128 && lum < 128) {
              bitmap[row * bytesPerRow + Math.floor(col / 8)] |= 1 << (7 - (col % 8));
            }
          }
        }

        const xL = bytesPerRow & 0xff;
        const xH = (bytesPerRow >> 8) & 0xff;
        const yL = h & 0xff;
        const yH = (h >> 8) & 0xff;
        let result = "\x1b\x61\x01"; // center
        result += String.fromCharCode(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH);
        for (let i = 0; i < bitmap.length; i++) {
          result += String.fromCharCode(bitmap[i]);
        }
        result += "\x1b\x61\x00"; // left
        resolve(result);
      };
      img.onerror = () => reject(new Error("Failed to load logo"));
      img.src = dataUrl;
    });
  };

  const buildEscPosCustomReceipt = async (): Promise<string> => {
    const WIDTH = 32; // 58mm = 32 chars
    const hr = "-".repeat(WIDTH);
    const CENTER_ON = "\x1ba\x01";
    const LEFT_ON = "\x1ba\x00";

    const lr = (l: string, r: string) => {
      const sp = WIDTH - l.length - r.length;
      return l + " ".repeat(Math.max(1, sp)) + r;
    };

    const out: string[] = [];
    out.push("\x1b@\x1b3\x14");

    // Print logo as raster image if available
    if (logoUrl) {
      try {
        const logoCmd = await buildLogoEscPos(logoUrl);
        out.push(logoCmd);
      } catch { /* skip logo */ }
    }

    out.push(CENTER_ON);

    if (businessName) out.push(businessName.slice(0, WIDTH));
    out.push(new Date().toLocaleString().slice(0, WIDTH));
    if (title) out.push(title.slice(0, WIDTH));
    if (billNo) out.push(`Bill #: ${billNo}`.slice(0, WIDTH));
    if (preparedBy) out.push(`Prepared By: ${preparedBy}`.slice(0, WIDTH));
    if (paymentMethod) out.push(`Payment: ${paymentMethod}`.slice(0, WIDTH));
    out.push(hr);

    out.push(LEFT_ON);

    for (const line of lines) {
      if (!line.label && !line.value) continue;
      if (line.value) {
        out.push(lr(line.label.slice(0, WIDTH - line.value.length - 1), line.value));
      } else {
        out.push(line.label.slice(0, WIDTH));
      }
    }

    if (note) {
      out.push(hr);
      const words = note.split(" ");
      let cur = "";
      for (const w of words) {
        if (cur.length + w.length + 1 > WIDTH) {
          out.push(cur);
          cur = w;
        } else {
          cur = cur ? cur + " " + w : w;
        }
      }
      if (cur) out.push(cur);
    }

    out.push(hr);
    out.push("");
    out.push("");
    out.push("\x1dV\x41\x03");

    return out.join("\n");
  };

  const printReceipt = async () => {
    try {
      const check = await canMakeSale("customPrint");
      if (!check.allowed) { setAdMsg(check.message); setAdNeedsOnlineCheck(!!check.needsOnlineVerification); setPendingPrintAction("print"); setAdOpen(true); return; }
      if (isNativeAndroid()) {
        const settings = await db.settings.get("app");
        if (!settings) { toast.error("No printer configured. Go to Admin > Printer to set up."); return; }
        const escpos = await buildEscPosCustomReceipt();
        await sendToDefaultPrinter(settings, escpos);
        toast.success("Receipt sent to printer");
        await incrementSaleCount("customPrint");
        return;
      }

      // Browser fallback: open print dialog
      const doc = await buildReceiptPdf();
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) {
        w.addEventListener("load", () => {
          w.print();
        });
        await incrementSaleCount("customPrint");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to print receipt");
    }
  };

  const saveReceipt = async () => {
    try {
      const check = await canMakeSale("customPrint");
      if (!check.allowed) { setAdMsg(check.message); setAdNeedsOnlineCheck(!!check.needsOnlineVerification); setPendingPrintAction("share"); setAdOpen(true); return; }
      const doc = await buildReceiptPdf();
      const blob = doc.output("blob");
      await savePdfBlob(blob, title || "receipt");
      await incrementSaleCount("customPrint");
    } catch {
      toast.error("Save failed");
    }
  };

  const shareReceipt = async () => {
    try {
      const check = await canMakeSale("customPrint");
      if (!check.allowed) { setAdMsg(check.message); setAdNeedsOnlineCheck(!!check.needsOnlineVerification); setPendingPrintAction("share"); setAdOpen(true); return; }
      const doc = await buildReceiptPdf();
      const blob = doc.output("blob");
      await sharePdfBlob(blob, title || "receipt");
      await incrementSaleCount("customPrint");
    } catch {
      toast.error("Share failed");
    }
  };

  /* ---------- Upload helpers ---------- */

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      toast.error("Please upload an image or PDF file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }
    // Store as base64 data URL to avoid blob URL issues
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedFileUrl(reader.result as string);
      setUploadedFileName(file.name);
      setUploadedFileType(isPdf ? "pdf" : "image");
      toast.success(`Uploaded: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  const printUploadedFile = async () => {
    if (!uploadedFileUrl) return;
    const check = await canMakeSale("customPrint");
    if (!check.allowed) { setAdMsg(check.message); setAdNeedsOnlineCheck(!!check.needsOnlineVerification); setPendingPrintAction("uploadPrint"); setAdOpen(true); return; }
    await incrementSaleCount("customPrint");

    // On native Android, print via thermal printer (USB/Bluetooth)
    if (isNativeAndroid()) {
      if (uploadedFileType === "image") {
        try {
          const escposData = await buildLogoEscPos(uploadedFileUrl);
          // Add init, center, feed & cut
          const fullCmd = "\x1b@\x1b3\x14" + escposData + "\n\n\n\x1dV\x41\x03";

          const settings = await db.settings.get("app");
          if (!settings) { toast.error("No printer configured."); return; }
          await sendToDefaultPrinter(settings, fullCmd);
          toast.success("Image sent to printer");
        } catch (err: any) {
          toast.error(err?.message || "Could not print image");
        }
      } else {
        // PDF files can't be rasterized to ESC/POS easily — use share as fallback
        try {
          const res = await fetch(uploadedFileUrl);
          const blob = await res.blob();
          await shareFileBlob(blob, uploadedFileName || "file");
        } catch {
          toast.error("Could not share PDF file");
        }
      }
      return;
    }

    // Browser fallback: hidden iframe print
    if (uploadedFileType === "image") {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.width = "800px";
      iframe.style.height = "600px";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        toast.error("Could not create print frame");
        document.body.removeChild(iframe);
        return;
      }
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><title>Print</title><style>@media print{body{margin:0}} body{display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;}</style></head><body><img src="${uploadedFileUrl}" style="max-width:100%;max-height:100vh;" /></body></html>`);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          toast.error("Could not open print dialog");
        }
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 60000);
      }, 500);
    } else {
      const res = await fetch(uploadedFileUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.width = "800px";
      iframe.style.height = "600px";
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      iframe.addEventListener("load", () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          toast.error("Could not open print dialog");
        }
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
          URL.revokeObjectURL(blobUrl);
        }, 60000);
      });
    }
  };

  const saveUploadedFile = async () => {
    if (!uploadedFileUrl) return;
    try {
      const res = await fetch(uploadedFileUrl);
      const blob = await res.blob();
      await saveFileBlob(blob, uploadedFileName || "file");
    } catch {
      toast.error("Save failed");
    }
  };

  const shareUploadedFile = async () => {
    if (!uploadedFileUrl) return;
    try {
      const res = await fetch(uploadedFileUrl);
      const blob = await res.blob();
      await shareFileBlob(blob, uploadedFileName || "file");
    } catch {
      toast.error("Share failed");
    }
  };

  return (
    <div className="space-y-4">
      {!embedded && (
        <header>
          <h1 className="text-2xl font-semibold">Custom Print</h1>
          <p className="text-sm text-muted-foreground">Create a custom receipt or upload your own PDF to print/share.</p>
        </header>
      )}

      <Tabs defaultValue="create">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="create"><FileText className="h-4 w-4 mr-1" />Create Receipt</TabsTrigger>
          <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1" />Upload File</TabsTrigger>
        </TabsList>

        {/* ---- CREATE TAB ---- */}
        <TabsContent value="create">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Builder */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Receipt Builder</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Logo (optional)</Label>
                  <div className="flex items-center gap-2">
                    <div className="h-12 w-12 rounded border flex items-center justify-center text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors" onClick={() => logoInputRef.current?.click()}>
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="h-full w-full rounded object-contain" />
                      ) : (
                        <ImageIcon className="h-5 w-5" />
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                      {logoUrl ? "Change" : "Upload"}
                    </Button>
                    {logoUrl && (
                      <Button variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Business Name (optional)</Label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" />
                </div>
                <div>
                  <Label className="text-xs">Receipt Title (optional)</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Invoice, Bill, Receipt" />
                </div>
                <div>
                  <Label className="text-xs">Bill No (optional)</Label>
                  <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="e.g. 001" />
                </div>
                <div>
                  <Label className="text-xs">Prepared By (optional)</Label>
                  <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="e.g. John" />
                </div>
                <div>
                  <Label className="text-xs">Payment Method (optional)</Label>
                  <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="e.g. Cash, Card, Credit" />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-xs">Line Items</Label>
                  {lines.map((line) => (
                    <div key={line.id} className="flex items-center gap-2">
                      <Input className="flex-1" placeholder="Label" value={line.label} onChange={(e) => updateLine(line.id, "label", e.target.value)} />
                      <Input className="w-28" placeholder="Value" value={line.value} onChange={(e) => updateLine(line.id, "value", e.target.value)} />
                      <Button variant="ghost" size="icon" onClick={() => removeLine(line.id)} disabled={lines.length <= 1}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addLine} className="w-full">
                    <Plus className="h-4 w-4 mr-1" /> Add Line
                  </Button>
                </div>

                <Separator />

                <div>
                  <Label className="text-xs">Note / Footer</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thank you for your purchase!" rows={2} />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" onClick={previewReceipt}><Eye className="h-4 w-4 mr-1" /> Preview</Button>
                  <Button variant="default" onClick={printReceipt}><Printer className="h-4 w-4 mr-1" /> Print</Button>
                  <Button variant="secondary" onClick={saveReceipt}><Download className="h-4 w-4 mr-1" /> Save</Button>
                  <Button variant="outline" onClick={shareReceipt}><Share2 className="h-4 w-4 mr-1" /> Share</Button>
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {showPreview ? (
                  <div className="border rounded-md p-4 bg-white text-black min-h-[300px] font-mono text-xs space-y-1">
                    {logoUrl && (
                      <div className="text-center mb-1">
                        <img src={logoUrl} alt="Logo" className="h-10 mx-auto object-contain" />
                      </div>
                    )}
                    {businessName && (
                      <div className="text-center font-bold text-sm">{businessName}</div>
                    )}
                    <div className="text-center text-[10px]">{new Date().toLocaleString()}</div>
                    {title && <div className="text-center font-bold">{title}</div>}
                    {billNo && <div className="text-center text-[10px]">Bill #: {billNo}</div>}
                    {preparedBy && <div className="text-center text-[10px]">Prepared By: {preparedBy}</div>}
                    {paymentMethod && <div className="text-center text-[10px]">Payment: {paymentMethod}</div>}
                    <Separator className="my-1 bg-black/30" />
                    {lines.map((line) =>
                      line.label || line.value ? (
                        <div key={line.id} className="flex justify-between">
                          <span>{line.label}</span>
                          <span>{line.value}</span>
                        </div>
                      ) : null
                    )}
                    {note && (
                      <>
                        <Separator className="my-1 bg-black/30" />
                        <div className="text-[10px] whitespace-pre-wrap">{note}</div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground text-sm border rounded-md">
                    <FileText className="h-10 w-10 mb-2 opacity-40" />
                    Click "Preview" to see your receipt
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---- UPLOAD TAB ---- */}
        <TabsContent value="upload">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload Image or PDF</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to upload an image or PDF file (max 10 MB)</p>
                {uploadedFileName && <p className="mt-2 text-sm font-medium text-foreground">{uploadedFileName}</p>}
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
              </div>

              {uploadedFileUrl && (
                <>
                  <div className="border rounded-md p-4 text-center space-y-2">
                    {uploadedFileType === "image" ? (
                      <img src={uploadedFileUrl} alt={uploadedFileName} className="max-h-[400px] mx-auto rounded object-contain" />
                    ) : (
                      <>
                        <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
                        <p className="font-medium text-sm">{uploadedFileName}</p>
                        <p className="text-xs text-muted-foreground">PDF uploaded and ready to print or share</p>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="default" onClick={printUploadedFile}><Printer className="h-4 w-4 mr-1" /> Print</Button>
                    <Button variant="secondary" onClick={saveUploadedFile}><Download className="h-4 w-4 mr-1" /> Save</Button>
                    <Button variant="outline" onClick={shareUploadedFile}><Share2 className="h-4 w-4 mr-1" /> Share</Button>
                    <Button variant="outline" onClick={() => { setUploadedFileUrl(null); setUploadedFileName(""); setUploadedFileType(null); }}>
                      <Trash2 className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <AdRewardDialog
        open={adOpen}
        onOpenChange={(v) => { setAdOpen(v); if (!v) setPendingPrintAction(null); }}
        module="customPrint"
        message={adMsg}
        onRewarded={() => {
          if (pendingPrintAction === "print") void printReceipt();
          else if (pendingPrintAction === "share") void shareReceipt();
          else if (pendingPrintAction === "uploadPrint") void printUploadedFile();
        }}
        needsOnlineVerification={adNeedsOnlineCheck}
      />
    </div>
  );
}
