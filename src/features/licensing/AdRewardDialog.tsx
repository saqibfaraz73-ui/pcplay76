/**
 * AdRewardDialog — shown when a free limit is reached.
 * User can watch a rewarded ad to get +5 entries, or upgrade to Premium.
 * When offline, the dialog is non-dismissable until they go online or upgrade.
 * Also handles periodic online verification requirement.
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
import { grantAdBonus, getAdBonusValue, type SalesModule } from "./licensing-db";
import { purchasePremium, restorePlayStorePurchase } from "./play-store-billing";
import { OnlineCheckDialog } from "./OnlineCheckDialog";
import { PlayCircle, Crown, Loader2, WifiOff, ShieldCheck, RotateCcw } from "lucide-react";

interface AdRewardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: SalesModule;
  message: string;
  onRewarded: () => void;
  /** When true, shows the online verification dialog instead of ad dialog */
  needsOnlineVerification?: boolean;
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
  needsOnlineVerification = false,
}: AdRewardDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [upgradeVisible, setUpgradeVisible] = React.useState(false);
  const [adError, setAdError] = React.useState<string | null>(null);
  const [purchasing, setPurchasing] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const isOnline = useIsOnline();

  // Reset error when connectivity changes
  React.useEffect(() => { if (isOnline) setAdError(null); }, [isOnline]);

  const handleWatchAd = async () => {
    if (!isOnline) return;
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

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const success = await purchasePremium();
      if (success) {
        onOpenChange(false);
        window.location.reload();
      }
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
      if (restored) {
        onOpenChange(false);
        window.location.reload();
      }
    } catch {
      // silently fail
    } finally {
      setRestoring(false);
    }
  };

  const handleOpenChange = (val: boolean) => {
    onOpenChange(val);
  };

  // Show online verification dialog instead of ad dialog
  if (needsOnlineVerification) {
    return (
      <OnlineCheckDialog
        open={open}
        onOpenChange={onOpenChange}
        onVerified={onRewarded}
      />
    );
  }

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
              No ads, no limits — unlimited access to all features.
            </AlertDialogDescription>
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
              disabled={purchasing || !isOnline}
            >
              {purchasing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
              ) : (
                <><Crown className="h-4 w-4 mr-2 text-amber-500" />Subscribe via Google Play</>
              )}
            </Button>
            <Button variant="ghost" className="w-full text-xs" onClick={() => void handleRestore()} disabled={restoring || !isOnline}>
              {restoring ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restoring...</> : <><RotateCcw className="h-4 w-4 mr-2" />Restore Purchase</>}
            </Button>
            <Button variant="ghost" className="w-full text-xs" onClick={() => setUpgradeVisible(false)}>
              Back
            </Button>
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
            <p className="text-muted-foreground">Earn <strong>+{getAdBonusValue()} free entries</strong> for this section</p>
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
            Upgrade to Premium (No Ads &amp; Unlimited Access)
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
