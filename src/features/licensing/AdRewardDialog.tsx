/**
 * AdRewardDialog — shown when a free limit is reached.
 * Since ads are removed, this just shows the upgrade message.
 */
import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Crown, ShieldCheck } from "lucide-react";
import type { SalesModule } from "./licensing-db";

interface AdRewardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: SalesModule;
  message: string;
  onRewarded: () => void;
  needsOnlineVerification?: boolean;
}

export function AdRewardDialog({
  open,
  onOpenChange,
  module,
  message,
  onRewarded,
  needsOnlineVerification = false,
}: AdRewardDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Free Limit Reached
          </AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border bg-muted/50 p-4 space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              <p className="font-medium">Upgrade to Premium</p>
              <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
                <li>Unlimited entries across all sections</li>
                <li>No limits — ever</li>
                <li>Priority support</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Contact the developer or your admin to activate premium for this device.
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            variant="ghost"
            className="w-full text-xs"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
