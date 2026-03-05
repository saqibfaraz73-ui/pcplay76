/**
 * OnlineCheckDialog — shown when 7+ days have passed without an internet verification.
 * Blocks usage until user connects to internet and subscription status is verified.
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
import { WifiOff, Wifi, Loader2, ShieldCheck } from "lucide-react";
import { getLicense } from "./licensing-db";

interface OnlineCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
}

export function OnlineCheckDialog({ open, onOpenChange, onVerified }: OnlineCheckDialogProps) {
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Auto-verify when coming online
  React.useEffect(() => {
    if (isOnline && open) {
      handleVerify();
    }
  }, [isOnline, open]);

  const handleVerify = async () => {
    if (!navigator.onLine) {
      setError("Still offline. Please connect to the internet.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      // getLicense() will call checkPlayStorePremium() which updates lastOnlineVerifiedAt
      await getLicense();
      onOpenChange(false);
      onVerified();
    } catch {
      setError("Verification failed. Please check your internet connection.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={() => { /* non-dismissable */ }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Periodic Verification Required
          </AlertDialogTitle>
          <AlertDialogDescription>
            For security purposes, the app needs to verify your subscription status at least once every 7 days. Please connect to the internet to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!isOnline && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              <strong>No internet connection.</strong> Please connect to WiFi or mobile data to verify.
            </span>
          </div>
        )}

        {isOnline && !checking && !error && (
          <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm text-primary">
            <Wifi className="h-4 w-4 shrink-0" />
            <span>Internet detected. Tap below to verify.</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive text-center rounded-md border border-destructive/40 bg-destructive/10 p-2">{error}</p>
        )}

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => void handleVerify()}
            disabled={checking || !isOnline}
          >
            {checking ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</>
            ) : !isOnline ? (
              <><WifiOff className="h-4 w-4 mr-2" />Waiting for Internet...</>
            ) : (
              <><ShieldCheck className="h-4 w-4 mr-2" />Verify Now</>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
