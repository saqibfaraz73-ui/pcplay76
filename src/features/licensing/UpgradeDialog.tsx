import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLicense, activatePremium } from "./licensing-db";
import { useToast } from "@/hooks/use-toast";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
}

export function UpgradeDialog({ open, onOpenChange, message }: UpgradeDialogProps) {
  const { toast } = useToast();
  const [key, setKey] = React.useState("");
  const [deviceId, setDeviceId] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      getLicense().then((lic) => setDeviceId(lic.deviceId));
    }
  }, [open]);

  const handleActivate = async () => {
    if (!key.trim()) {
      toast({ title: "Enter activation key", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const ok = await activatePremium(key.trim(), deviceId);
      if (ok) {
        toast({ title: "Premium activated!", description: "All limits have been removed." });
        onOpenChange(false);
      } else {
        toast({ title: "Invalid key", description: "This activation key is not valid for this device.", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Upgrade to Premium</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Device ID</Label>
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-mono select-all">{deviceId}</div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="activationKey">Activation Key</Label>
            <Input
              id="activationKey"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your activation key"
              autoComplete="off"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleActivate} disabled={loading}>
            {loading ? "Activating..." : "Activate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
