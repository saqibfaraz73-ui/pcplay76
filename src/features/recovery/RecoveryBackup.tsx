import React from "react";
import { db } from "@/db/appDb";
import type { RecoveryCustomer, RecoveryPayment } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

type RecoveryBackupPayload = {
  type: "recovery_backup";
  version: 1;
  createdAt: number;
  customers: RecoveryCustomer[];
  payments: RecoveryPayment[];
};

export function RecoveryBackup({ onRestore }: { onRestore?: () => void }) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    try {
      const customers = await db.recoveryCustomers.toArray();
      const payments = await db.recoveryPayments.toArray();
      const payload: RecoveryBackupPayload = {
        type: "recovery_backup",
        version: 1,
        createdAt: Date.now(),
        customers,
        payments,
      };
      const json = JSON.stringify(payload);
      const fileName = `recovery_backup_${Date.now()}.json`;

      if (Capacitor.isNativePlatform()) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(json);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const tmpPath = `__share_tmp__/${fileName}`;
        await Filesystem.writeFile({ directory: Directory.Cache, path: tmpPath, data: base64, recursive: true });
        const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: tmpPath });
        await Share.share({ title: fileName, url: uri, dialogTitle: "Share Recovery Backup" });
        try { await Filesystem.deleteFile({ directory: Directory.Cache, path: tmpPath }); } catch {}
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }

      toast({ title: "Backup exported", description: `${customers.length} customers, ${payments.length} payments` });
    } catch (e: any) {
      toast({ title: "Backup failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as RecoveryBackupPayload;
      if (data.type !== "recovery_backup") throw new Error("Not a valid recovery backup file.");
      await db.transaction("rw", [db.recoveryCustomers, db.recoveryPayments], async () => {
        await db.recoveryCustomers.clear();
        await db.recoveryPayments.clear();
        if (data.customers?.length) await db.recoveryCustomers.bulkPut(data.customers);
        if (data.payments?.length) await db.recoveryPayments.bulkPut(data.payments);
      });
      toast({ title: "Backup restored", description: `${data.customers?.length ?? 0} customers, ${data.payments?.length ?? 0} payments` });
      onRestore?.();
    } catch (err: any) {
      toast({ title: "Restore failed", description: err?.message ?? String(err), variant: "destructive" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base">Backup & Restore</CardTitle>
        <CardDescription>Export or import all recovery data</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void exportBackup()}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export Backup
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Restore Backup
        </Button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importBackup} />
      </CardContent>
    </Card>
  );
}
