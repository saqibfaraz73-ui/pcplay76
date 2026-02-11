import React from "react";
import { cn } from "@/lib/utils";
import { getItemImageSrc } from "@/features/admin/products/item-images";
import { resolveStockImage } from "@/features/pos/stock-images";

export function ItemImageThumb(props: {
  imagePath?: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!props.imagePath) {
      setSrc(null);
      return;
    }

    // Check for stock images first
    if (props.imagePath.startsWith("stock://")) {
      setSrc(resolveStockImage(props.imagePath));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
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

  if (!props.imagePath || !src) {
    return (
      <div
        className={cn(
          "aspect-[4/3] w-full rounded-md border bg-muted/20",
          props.className,
        )}
        aria-hidden
      />
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-md border", props.className)}>
      <img src={src} alt={props.alt} className="h-full w-full object-cover" loading="lazy" />
    </div>
  );
}
