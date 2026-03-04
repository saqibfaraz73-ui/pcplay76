import React from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Crown, Loader2, ShieldCheck } from "lucide-react";
import { purchasePremium, restorePlayStorePurchase } from "./play-store-billing";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
}

export function UpgradeDialog({ open, onOpenChange, message }: UpgradeDialogProps) {
  const [purchasing, setPurchasing] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [priceLabel, setPriceLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { getSubscriptionPrice } = await import("./play-store-billing");
        const price = await getSubscriptionPrice();
        if (!cancelled && price) setPriceLabel(price);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [open]);

  const handlePurchase = async () => {
    setPurchasing(true);
    setError(null);
    try {
      const success = await purchasePremium();
      if (success) {
        onOpenChange(false);
        // Reload to ensure all components recognize premium status
        window.location.reload();
      } else {
        setError("Purchase was not completed. Please try again.");
      }
    } catch (e: any) {
      setError(e?.message || "Purchase failed. Please check your internet connection and try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      const restored = await restorePlayStorePurchase();
      if (restored) {
        onOpenChange(false);
        window.location.reload();
      } else {
        setError("No previous purchase found.");
      }
    } catch (e: any) {
      setError(e?.message || "Restore failed.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Upgrade to Premium
          </AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-md border bg-muted/50 p-4 space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              <p className="font-medium">What you get with Premium:</p>
              <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
                <li>Unlimited orders, expenses & entries — no daily limits</li>
                <li>Full sales & credit reports with PDF export</li>
                <li>Ad-free experience — no interruptions, ever</li>
                <li>Priority support & future feature updates</li>
              </ul>
            </div>
          </div>
        </div>
        {error && (
          <p className="text-xs text-destructive text-center rounded-md border border-destructive/40 bg-destructive/10 p-2">{error}</p>
        )}
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => void handlePurchase()}
            disabled={purchasing}
          >
            {purchasing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
            ) : (
              <><Crown className="h-4 w-4 mr-2 text-amber-500" />Subscribe{priceLabel ? ` — ${priceLabel}/month` : " via Google Play"}</>
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-xs"
            onClick={() => void handleRestore()}
            disabled={restoring}
          >
            {restoring ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restoring...</>
            ) : (
              "Restore Purchase"
            )}
          </Button>
          <AlertDialogCancel className="w-full">Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
