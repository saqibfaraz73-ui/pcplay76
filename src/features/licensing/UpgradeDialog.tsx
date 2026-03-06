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
import { Crown, Loader2, ShieldCheck, Check } from "lucide-react";
import { purchasePremium, restorePlayStorePurchase, getAvailablePackages, type SubscriptionPackage } from "./play-store-billing";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
}

export function UpgradeDialog({ open, onOpenChange, message }: UpgradeDialogProps) {
  const [purchasing, setPurchasing] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [packages, setPackages] = React.useState<SubscriptionPackage[]>([]);
  const [selectedIdx, setSelectedIdx] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const pkgs = await getAvailablePackages();
        if (!cancelled && pkgs.length > 0) {
          setPackages(pkgs);
          // Default to yearly if available, otherwise first
          const yearlyIdx = pkgs.findIndex(p => p.packageType === "ANNUAL");
          setSelectedIdx(yearlyIdx >= 0 ? yearlyIdx : 0);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [open]);

  const handlePurchase = async () => {
    setPurchasing(true);
    setError(null);
    try {
      const pkg = packages[selectedIdx];
      const success = await purchasePremium(pkg);
      if (success) {
        onOpenChange(false);
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

  const selectedPkg = packages[selectedIdx];

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

        {/* Plan selector */}
        {packages.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            {packages.map((pkg, idx) => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`relative rounded-lg border-2 p-3 text-left transition-all ${
                  selectedIdx === idx
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                {selectedIdx === idx && (
                  <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                )}
                <p className="text-sm font-semibold">{pkg.label}</p>
                <p className="text-lg font-bold text-foreground">{pkg.priceString}</p>
                {pkg.packageType === "ANNUAL" && (
                  <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                    Best Value
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

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
              <><Crown className="h-4 w-4 mr-2 text-amber-500" />
                Subscribe{selectedPkg ? ` — ${selectedPkg.priceString}/${selectedPkg.packageType === "ANNUAL" ? "year" : "month"}` : " via Google Play"}
              </>
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
