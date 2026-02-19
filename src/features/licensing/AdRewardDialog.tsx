/**
 * AdRewardDialog — shown when a free limit is reached.
 * User can watch a rewarded ad to get +3 entries, or upgrade to Premium.
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
import { PlayCircle, Crown, Loader2 } from "lucide-react";

interface AdRewardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: SalesModule;
  message: string;
  onRewarded: () => void; // called after successful ad watch — retry the action
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

  const handleWatchAd = async () => {
    setLoading(true);
    try {
      const earned = await showRewardedAd();
      if (earned) {
        await grantAdBonus(module);
        onOpenChange(false);
        onRewarded();
      } else {
        // User skipped / closed ad without earning
        alert("Please watch the full ad to earn bonus entries.");
      }
    } catch (e: any) {
      alert("Ad failed to load. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  if (upgradeVisible) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
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
            <p className="font-medium">Contact us to upgrade:</p>
            <p>📧 <a href="mailto:sangiaipos@gmail.com" className="text-primary underline">sangiaipos@gmail.com</a></p>
            <p>📱 <a href="https://wa.me/923041593340" target="_blank" rel="noopener noreferrer" className="text-primary underline">WhatsApp: +92 304 1593340</a></p>
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setUpgradeVisible(false)}>Back</Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-primary" />
            Free Limit Reached
          </AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border bg-primary/5 p-4 text-sm text-center space-y-1">
          <p className="font-semibold text-primary">Watch a short ad</p>
          <p className="text-muted-foreground">Earn <strong>+{AD_BONUS} free entries</strong> for this section</p>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => void handleWatchAd()}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading Ad...</>
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
