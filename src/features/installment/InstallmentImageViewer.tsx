import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Share2, X } from "lucide-react";

interface Props {
  images: string[];
  initialIndex?: number;
  customerName: string;
  onClose: () => void;
}

export function InstallmentImageViewer({ images, initialIndex = 0, customerName, onClose }: Props) {
  const [index, setIndex] = React.useState(initialIndex);
  const img = images[index];

  const shareImage = async () => {
    try {
      // Convert base64 data URI to blob
      const res = await fetch(img);
      const blob = await res.blob();
      const file = new File([blob], `${customerName}_doc_${index + 1}.jpg`, { type: blob.type });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${customerName} - Document ${index + 1}` });
      } else {
        // Fallback: open in new tab
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        // Fallback: download
        const a = document.createElement("a");
        a.href = img;
        a.download = `${customerName}_doc_${index + 1}.jpg`;
        a.click();
      }
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="p-3 pb-0">
          <DialogTitle className="text-sm flex items-center justify-between">
            <span>{customerName} — Image {index + 1}/{images.length}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative bg-black/5 flex items-center justify-center min-h-[300px] max-h-[60vh]">
          <img
            src={img}
            alt={`Document ${index + 1}`}
            className="max-w-full max-h-[60vh] object-contain"
          />

          {images.length > 1 && (
            <>
              <Button
                size="icon"
                variant="secondary"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-80"
                onClick={() => setIndex(i => (i - 1 + images.length) % images.length)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-80"
                onClick={() => setIndex(i => (i + 1) % images.length)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        <div className="flex justify-center gap-2 p-3 pt-0">
          <Button size="sm" variant="outline" onClick={shareImage}>
            <Share2 className="h-4 w-4 mr-1" /> Share
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
