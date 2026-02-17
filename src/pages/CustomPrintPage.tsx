import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Upload, Printer, Share2, Plus, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

interface ReceiptLine {
  id: string;
  label: string;
  value: string;
}

export default function CustomPrintPage() {
  // Custom receipt builder state
  const [title, setTitle] = useState("Custom Receipt");
  const [businessName, setBusinessName] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([
    { id: crypto.randomUUID(), label: "Item", value: "" },
  ]);

  // Uploaded PDF state
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);

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

  const buildReceiptPdf = (): jsPDF => {
    const doc = new jsPDF({ unit: "mm", format: [80, 150] });
    let y = 8;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    if (businessName) {
      doc.text(businessName, 40, y, { align: "center" });
      y += 6;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, 40, y, { align: "center" });
    y += 5;

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

    if (note) {
      y += 2;
      doc.line(4, y, 76, y);
      y += 4;
      doc.setFontSize(7);
      const splitNote = doc.splitTextToSize(note, 68);
      doc.text(splitNote, 4, y);
      y += splitNote.length * 3;
    }

    y += 4;
    doc.setFontSize(7);
    doc.text(new Date().toLocaleString(), 40, y, { align: "center" });

    return doc;
  };

  const previewReceipt = () => {
    setShowPreview(true);
  };

  const printReceipt = () => {
    try {
      const doc = buildReceiptPdf();
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) {
        w.addEventListener("load", () => {
          w.print();
        });
      }
    } catch {
      toast.error("Failed to print receipt");
    }
  };

  const shareReceipt = async () => {
    try {
      const doc = buildReceiptPdf();
      const blob = doc.output("blob");
      const file = new File([blob], `${title || "receipt"}.pdf`, { type: "application/pdf" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: title || "Receipt", files: [file] });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title || "receipt"}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Receipt downloaded");
      }
    } catch {
      toast.error("Share failed");
    }
  };

  /* ---------- Upload helpers ---------- */

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }
    const url = URL.createObjectURL(file);
    setUploadedPdfUrl(url);
    setUploadedFileName(file.name);
    toast.success(`Uploaded: ${file.name}`);
  };

  const printUploadedPdf = () => {
    if (!uploadedPdfUrl) return;
    const w = window.open(uploadedPdfUrl, "_blank");
    if (w) w.addEventListener("load", () => w.print());
  };

  const shareUploadedPdf = async () => {
    if (!uploadedPdfUrl) return;
    try {
      const res = await fetch(uploadedPdfUrl);
      const blob = await res.blob();
      const file = new File([blob], uploadedFileName || "receipt.pdf", { type: "application/pdf" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: uploadedFileName, files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = uploadedPdfUrl;
        a.download = uploadedFileName || "receipt.pdf";
        a.click();
        toast.success("PDF downloaded");
      }
    } catch {
      toast.error("Share failed");
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Custom Print</h1>
        <p className="text-sm text-muted-foreground">Create a custom receipt or upload your own PDF to print/share.</p>
      </header>

      <Tabs defaultValue="create">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="create"><FileText className="h-4 w-4 mr-1" />Create Receipt</TabsTrigger>
          <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1" />Upload PDF</TabsTrigger>
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
                  <Label className="text-xs">Business Name</Label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" />
                </div>
                <div>
                  <Label className="text-xs">Receipt Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Invoice, Bill, Receipt" />
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
                  <Button variant="secondary" onClick={shareReceipt}><Share2 className="h-4 w-4 mr-1" /> Share</Button>
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
                    {businessName && (
                      <div className="text-center font-bold text-sm">{businessName}</div>
                    )}
                    <div className="text-center font-bold">{title}</div>
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
                    <div className="text-center text-[10px] pt-2 text-gray-500">
                      {new Date().toLocaleString()}
                    </div>
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
              <CardTitle className="text-base">Upload a PDF Receipt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to upload a PDF file (max 10 MB)</p>
                {uploadedFileName && <p className="mt-2 text-sm font-medium text-foreground">{uploadedFileName}</p>}
                <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
              </div>

              {uploadedPdfUrl && (
                <>
                  <div className="border rounded-md p-6 text-center space-y-2">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="font-medium text-sm">{uploadedFileName}</p>
                    <p className="text-xs text-muted-foreground">PDF uploaded and ready to print or share</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="default" onClick={printUploadedPdf}><Printer className="h-4 w-4 mr-1" /> Print</Button>
                    <Button variant="secondary" onClick={shareUploadedPdf}><Share2 className="h-4 w-4 mr-1" /> Share / Download</Button>
                    <Button variant="outline" onClick={() => { setUploadedPdfUrl(null); setUploadedFileName(""); }}>
                      <Trash2 className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
