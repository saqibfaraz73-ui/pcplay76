import React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getItemImageSrc, canUploadItemImages, saveItemImage } from "@/features/admin/products/item-images";
import { STOCK_IMAGES, resolveStockImage } from "@/features/pos/stock-images";
import { useToast } from "@/hooks/use-toast";
import { ImageIcon } from "lucide-react";

export function ItemImagePicker(props: {
  itemId: string;
  imagePath?: string;
  onChangeImagePath: (next: string) => void;
}) {
  const { toast } = useToast();
  const [src, setSrc] = React.useState<string | null>(null);
  const [stockOpen, setStockOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Handle stock images
        if (props.imagePath?.startsWith("stock://")) {
          const stockSrc = resolveStockImage(props.imagePath);
          if (!cancelled) setSrc(stockSrc);
          return;
        }
        const next = await getItemImageSrc(props.imagePath);
        if (!cancelled) setSrc(next);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.imagePath]);

  const onPick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const path = await saveItemImage({ itemId: props.itemId, file });
      props.onChangeImagePath(path);
      toast({ title: "Image saved" });
    } catch (err: any) {
      toast({ title: "Could not save image", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const onSelectStock = (key: string) => {
    props.onChangeImagePath(key);
    setStockOpen(false);
    toast({ title: "Stock image selected" });
  };

  return (
    <div className="space-y-2">
      <Label>Item image (optional)</Label>

      {src ? (
        <div className="overflow-hidden rounded-md border">
          <img src={src} alt="Item" className="h-40 w-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="rounded-md border p-3 text-xs text-muted-foreground">
          {props.imagePath ? "Image unavailable." : "No image selected."}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="file"
          accept="image/*"
          onChange={onPick}
          disabled={!canUploadItemImages()}
          className="hidden"
          id={`item-image-${props.itemId}`}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!canUploadItemImages()}
          onClick={() => document.getElementById(`item-image-${props.itemId}`)?.click()}
        >
          Upload image
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setStockOpen(true)}
        >
          <ImageIcon className="h-4 w-4 mr-1" />
          Select from stock
        </Button>
        {!canUploadItemImages() ? (
          <div className="text-xs text-muted-foreground">Upload available only in the installed app.</div>
        ) : null}
      </div>

      {/* Stock image picker dialog */}
      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Stock Image</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {STOCK_IMAGES.map((img) => (
              <button
                key={img.key}
                type="button"
                className={`rounded-md border-2 overflow-hidden transition-all hover:border-primary ${
                  props.imagePath === img.key ? "border-primary ring-2 ring-primary/30" : "border-muted"
                }`}
                onClick={() => onSelectStock(img.key)}
              >
                <img src={img.src} alt={img.label} className="aspect-square w-full object-cover" loading="lazy" />
                <div className="text-[10px] text-center py-1 truncate px-1">{img.label}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
