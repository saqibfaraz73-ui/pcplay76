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

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const success = await purchasePremium();
      if (success) onOpenChange(false);
    } catch {
      // silently fail
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restorePlayStorePurchase();
      if (restored) onOpenChange(false);
    } catch {
      // silently fail
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
                <li>Unlimited entries across all sections</li>
                <li>No ads — ever</li>
                <li>Priority support</li>
              </ul>
            </div>
          </div>
        </div>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => void handlePurchase()}
            disabled={purchasing}
          >
            {purchasing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
            ) : (
              <><Crown className="h-4 w-4 mr-2 text-amber-500" />Subscribe via Google Play</>
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
