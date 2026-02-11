import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

const BACKUP_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours
const CHECK_INTERVAL_MS = 60 * 1000; // check every minute
const STORAGE_KEY = "sangi_last_backup_ts";

export function BackupReminder() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!session || session.role !== "admin") return;

    // Initialize timestamp if not set
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }

    const check = () => {
      const last = Number(localStorage.getItem(STORAGE_KEY) || Date.now());
      if (Date.now() - last >= BACKUP_INTERVAL_MS) {
        setOpen(true);
      }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [session]);

  const dismiss = () => {
    // Snooze for another 8 hours
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setOpen(false);
  };

  const goBackup = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setOpen(false);
    navigate("/admin");
  };

  if (!session) return null;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Backup Reminder</AlertDialogTitle>
          <AlertDialogDescription>
            It's been 8 hours since your last backup. We recommend backing up your data regularly to prevent data loss.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={dismiss}>Later</AlertDialogCancel>
          <AlertDialogAction onClick={goBackup}>Backup Now</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Call this after a successful backup to reset the timer */
export function markBackupDone() {
  localStorage.setItem(STORAGE_KEY, String(Date.now()));
}
