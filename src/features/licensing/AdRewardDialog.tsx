/**
 * AdRewardDialog — shown when a free limit is reached.
 * User can watch a rewarded ad to get +3 entries, or upgrade to Premium.
 * When offline, the dialog is non-dismissable until they go online or upgrade.
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
import { showRewardedAd } from "./admob-ads";
import { grantAdBonus, AD_BONUS, type SalesModule } from "./licensing-db";
import { PlayCircle, Crown, Loader2, WifiOff } from "lucide-react";

interface AdRewardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: SalesModule;
  message: string;
  onRewarded: () => void;
}

function useIsOnline() {
  const [online, setOnline] = React.useState(navigator.onLine);
  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function AdRewardDialog({
  open,
  onOpenChange,
  module,
  message,
  onRewarded,
}: AdRewardDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [upgradeVisible, setUpgradeVisible] = React.useState(false);
  const [adError, setAdError] = React.useState<string | null>(null);
  const isOnline = useIsOnline();

  // Reset error when connectivity changes
  React.useEffect(() => { if (isOnline) setAdError(null); }, [isOnline]);

  const handleWatchAd = async () => {
    if (!isOnline) return; // guard — button should already be disabled
    setAdError(null);
    setLoading(true);
    try {
      const earned = await showRewardedAd();
      if (earned) {
        await grantAdBonus(module);
        onOpenChange(false);
        onRewarded();
      } else {
        setAdError("Please watch the full ad to earn bonus entries.");
      }
    } catch {
      setAdError("Ad failed to load. Please check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Allow closing — closing never resets free entries or counts.
  // Bonus entries are ONLY granted after a fully completed rewarded ad (earned === true).
  const handleOpenChange = (val: boolean) => {
    onOpenChange(val);
  };

  if (upgradeVisible) {
    return (
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Upgrade to Premium
            </AlertDialogTitle>
            <AlertDialogDescription>
              Get unlimited entries across all sections — no ads, no limits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border bg-muted/50 p-3 space-y-2 text-sm">
            <p className="font-medium">Subscribe via Google Play Store:</p>
            <p className="text-muted-foreground">Open the app on your device and subscribe to SANGI POS Pro from the Play Store to unlock unlimited access.</p>
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setUpgradeVisible(false)}>Back</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-primary" />
            Free Limit Reached
          </AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>

        {!isOnline && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              <strong>No internet connection.</strong> You need to be online to watch an ad and unlock more entries. Please connect to the internet to continue.
            </span>
          </div>
        )}

        {isOnline && (
          <div className="rounded-md border bg-primary/5 p-4 text-sm text-center space-y-1">
            <p className="font-semibold text-primary">Watch a short ad</p>
            <p className="text-muted-foreground">Earn <strong>+{AD_BONUS} free entries</strong> for this section</p>
          </div>
        )}

        {adError && (
          <p className="text-xs text-destructive text-center">{adError}</p>
        )}

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => void handleWatchAd()}
            disabled={loading || !isOnline}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading Ad...</>
            ) : !isOnline ? (
              <><WifiOff className="h-4 w-4 mr-2" />Connect to Internet to Watch Ad</>
            ) : (
              <><PlayCircle className="h-4 w-4 mr-2" />Watch Ad → Get +{AD_BONUS} Entries</>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setUpgradeVisible(true)}
          >
            <Crown className="h-4 w-4 mr-2 text-amber-500" />
            Upgrade to Premium (No Ads)
          </Button>
          <Button
            variant="ghost"
            className="w-full text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
