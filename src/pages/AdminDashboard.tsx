import React from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminProducts } from "@/features/admin/products/AdminProducts";
import { AdminInventory } from "@/features/admin/inventory/AdminInventory";
import { AdminCustomers } from "@/features/admin/customers/AdminCustomers";
import { AdminBackupRestore } from "@/features/admin/backup/AdminBackupRestore";
import { DataCleanup } from "@/features/admin/settings/DataCleanup";
import { InstallmentSection } from "@/features/installment/InstallmentSection";
import { ensureSeedData } from "@/db/seed";
import { db } from "@/db/appDb";

export default function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "products";
  const [installmentEnabled, setInstallmentEnabled] = React.useState(false);

  React.useEffect(() => {
    void ensureSeedData();
    db.settings.get("app").then(s => setInstallmentEnabled(!!s?.installmentEnabled));
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">Manage products, inventory, customers, and backups.</p>
      </header>
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex w-full overflow-x-auto justify-start gap-1 no-scrollbar">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          {installmentEnabled && <TabsTrigger value="installment">Installment</TabsTrigger>}
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
        </TabsList>
        <TabsContent value="products"><AdminProducts /></TabsContent>
        <TabsContent value="inventory"><AdminInventory /></TabsContent>
        <TabsContent value="customers"><AdminCustomers /></TabsContent>
        {installmentEnabled && <TabsContent value="installment"><InstallmentSection /></TabsContent>}
        <TabsContent value="backup"><AdminBackupRestore /></TabsContent>
        <TabsContent value="cleanup"><DataCleanup /></TabsContent>
      </Tabs>
    </div>
  );
}
