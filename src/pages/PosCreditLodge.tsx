import { AdminCustomers } from "@/features/admin/customers/AdminCustomers";

export default function PosCreditLodge() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Credit Lodge & Customers</h1>
      <AdminCustomers />
    </div>
  );
}
