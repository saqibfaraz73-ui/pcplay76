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
import { getLicense } from "./licensing-db";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
}

export function UpgradeDialog({ open, onOpenChange, message }: UpgradeDialogProps) {
  const [deviceId, setDeviceId] = React.useState("");
  const [isExpired, setIsExpired] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      getLicense().then((lic) => {
        setDeviceId(lic.deviceId);
        // Check if license expired
        setIsExpired(!!(lic.validUntil && lic.validUntil > 0 && Date.now() > lic.validUntil));
      });
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isExpired ? "License Expired" : "Upgrade to Premium"}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        {isExpired && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive">⚠️ Your premium license has expired.</p>
            <p className="text-muted-foreground mt-1">Please contact support to renew your license or upgrade to a new plan.</p>
          </div>
        )}
        <div className="rounded-md border bg-muted/50 p-3 space-y-2 text-sm">
          <p className="font-medium">Contact us to {isExpired ? "renew" : "upgrade"}:</p>
          <p>📧 Email: <a href="mailto:sangiaipos@gmail.com" className="text-primary underline">sangiaipos@gmail.com</a></p>
          <p>📱 WhatsApp: <a href="https://wa.me/923041593340" target="_blank" rel="noopener noreferrer" className="text-primary underline">+92 304 1593340</a></p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Your Device ID (share this with support):</p>
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-mono select-all cursor-pointer">{deviceId}</div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
