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
        setIsExpired(!!(lic.validUntil && lic.validUntil > 0 && Date.now() > lic.validUntil));
      });
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{isExpired ? "License Expired" : "Free Limit Reached"}</AlertDialogTitle>
          <AlertDialogDescription>Upgrade information</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          <p className="font-medium text-destructive">⚠️ {message}</p>

          {isExpired && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="font-medium text-destructive">Your premium license has expired.</p>
              <p className="text-xs text-muted-foreground mt-1">Please contact support to renew your license.</p>
            </div>
          )}

          <div className="rounded-md border bg-muted/50 p-3 space-y-2">
            <p className="font-medium">Contact us to {isExpired ? "renew" : "upgrade"}:</p>
            <p className="text-xs">📧 Email: <a href="mailto:info@sangitech.com" className="text-primary underline">info@sangitech.com</a></p>
            <p className="text-xs">📱 WhatsApp: <a href="https://wa.me/923041593340" className="text-primary underline">+92 304 1593340</a></p>
          </div>

          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">Your Device ID (share this with support):</p>
            <p
              className="font-mono text-xs bg-background p-2 rounded select-all break-all cursor-pointer"
              onClick={() => {
                navigator.clipboard?.writeText(deviceId);
              }}
            >
              {deviceId}
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="w-full">Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
