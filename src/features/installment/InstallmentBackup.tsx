import React from "react";
import { db } from "@/db/appDb";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

type InstallmentBackupPayload = {
  type: "installment_backup";
  version: 1;
  createdAt: number;
  customers: InstallmentCustomer[];
  payments: InstallmentPayment[];
};

export function InstallmentBackup({ onRestore }: { onRestore?: () => void }) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    try {
      const customers = await db.installmentCustomers.toArray();
      const payments = await db.installmentPayments.toArray();
      const payload: InstallmentBackupPayload = {
        type: "installment_backup",
        version: 1,
        createdAt: Date.now(),
        customers,
        payments,
      };
      const json = JSON.stringify(payload);
      const fileName = `installment_backup_${Date.now()}.json`;

      if (Capacitor.isNativePlatform()) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(json);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const tmpPath = `__share_tmp__/${fileName}`;
        await Filesystem.writeFile({ directory: Directory.Cache, path: tmpPath, data: base64, recursive: true });
        const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: tmpPath });
        await Share.share({ title: fileName, url: uri, dialogTitle: "Share Installment Backup" });
        try { await Filesystem.deleteFile({ directory: Directory.Cache, path: tmpPath }); } catch {}
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }

      const imgCount = customers.reduce((n, c) => n + (c.images?.length ?? 0), 0);
      toast({ title: "Backup exported", description: `${customers.length} customers, ${payments.length} payments, ${imgCount} images` });
    } catch (e: any) {
      toast({ title: "Backup failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as InstallmentBackupPayload;
      if (data.type !== "installment_backup") throw new Error("Not a valid installment backup file.");
      await db.transaction("rw", [db.installmentCustomers, db.installmentPayments], async () => {
        await db.installmentCustomers.clear();
        await db.installmentPayments.clear();
        if (data.customers?.length) await db.installmentCustomers.bulkPut(data.customers);
        if (data.payments?.length) await db.installmentPayments.bulkPut(data.payments);
      });
      const imgCount = (data.customers ?? []).reduce((n, c) => n + (c.images?.length ?? 0), 0);
      toast({ title: "Backup restored", description: `${data.customers?.length ?? 0} customers, ${data.payments?.length ?? 0} payments, ${imgCount} images` });
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
        <CardDescription>Export or import all installment data including customer images</CardDescription>
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
