/**
 * OnlineCheckDialog — stub since online verification has been removed.
 * Kept for backward compatibility.
 */
import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface OnlineCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
}

export function OnlineCheckDialog({ open, onOpenChange, onVerified }: OnlineCheckDialogProps) {
  React.useEffect(() => {
    if (open) {
      // Auto-close since online check is no longer needed
      onOpenChange(false);
      onVerified();
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Verification</AlertDialogTitle>
          <AlertDialogDescription>Verifying...</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={() => { onOpenChange(false); onVerified(); }}>OK</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
