import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

type Options = {
  /** If true, the app will show an exit confirm when the user presses Android back on these paths. */
  confirmOnPaths: string[];
  /** Called when a back press should behave like navigation (not exit). */
  onNavigateBack: () => void;
};

export function useAndroidBackExitConfirm({ confirmOnPaths, onNavigateBack }: Options) {
  const [exitConfirmOpen, setExitConfirmOpen] = React.useState(false);
  const lastBackPressRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (Capacitor.getPlatform() !== "android") return;

    const remove = App.addListener("backButton", () => {
      const path = window.location.pathname;
      if (confirmOnPaths.includes(path)) {
        const now = Date.now();
        // Require double-tap within 2 seconds to show exit dialog
        if (now - lastBackPressRef.current < 2000) {
          setExitConfirmOpen(true);
        } else {
          lastBackPressRef.current = now;
          // Optionally show a toast: "Press back again to exit"
        }
        return;
      }
      onNavigateBack();
    });

    return () => {
      void remove.then((h) => h.remove());
    };
  }, [confirmOnPaths, onNavigateBack]);

  const requestExit = React.useCallback(() => {
    setExitConfirmOpen(true);
  }, []);

  const cancelExit = React.useCallback(() => {
    setExitConfirmOpen(false);
  }, []);

  const confirmExit = React.useCallback(async () => {
    setExitConfirmOpen(false);
    await App.exitApp();
  }, []);

  return {
    exitConfirmOpen,
    requestExit,
    cancelExit,
    confirmExit,
  };
}
