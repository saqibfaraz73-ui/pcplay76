import { AdminDelivery } from "@/features/admin/delivery/AdminDelivery";

export default function AdminDeliveryPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Delivery</h1>
        <p className="text-sm text-muted-foreground">Manage delivery settings and delivery persons.</p>
      </header>
      <AdminDelivery />
    </div>
  );
}
