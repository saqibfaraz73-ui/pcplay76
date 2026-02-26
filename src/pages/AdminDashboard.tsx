import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminProducts } from "@/features/admin/products/AdminProducts";
import { AdminInventory } from "@/features/admin/inventory/AdminInventory";
import { AdminCustomers } from "@/features/admin/customers/AdminCustomers";
import { AdminBackupRestore } from "@/features/admin/backup/AdminBackupRestore";
import { DataCleanup } from "@/features/admin/settings/DataCleanup";
import { AdminDelivery } from "@/features/admin/delivery/AdminDelivery";
import { useAuth } from "@/auth/AuthProvider";
import { db } from "@/db/appDb";
import React from "react";
import CustomPrintPage from "@/pages/CustomPrintPage";

export default function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "products";
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const [deliveryEnabled, setDeliveryEnabled] = React.useState(false);

  React.useEffect(() => {
    db.settings.get("app").then((s) => {
      setDeliveryEnabled(!!s?.deliveryEnabled);
    });
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">Manage products, inventory, customers, and backups.</p>
      </header>
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          {deliveryEnabled && <TabsTrigger value="delivery">Delivery</TabsTrigger>}
          <TabsTrigger value="custom-print">Custom Print</TabsTrigger>
          {isAdmin && <TabsTrigger value="cleanup">Data Cleanup</TabsTrigger>}
        </TabsList>
        <TabsContent value="products"><AdminProducts /></TabsContent>
        <TabsContent value="inventory"><AdminInventory /></TabsContent>
        <TabsContent value="customers"><AdminCustomers /></TabsContent>
        <TabsContent value="backup"><AdminBackupRestore /></TabsContent>
        {deliveryEnabled && (
          <TabsContent value="delivery"><AdminDelivery /></TabsContent>
        )}
        <TabsContent value="custom-print"><CustomPrintPage embedded /></TabsContent>
        {isAdmin && <TabsContent value="cleanup"><DataCleanup /></TabsContent>}
      </Tabs>
    </div>
  );
}
