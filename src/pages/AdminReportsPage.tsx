import { AdminReports } from "@/features/admin/reports/AdminReports";

export default function AdminReportsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">View and export sales reports.</p>
      </header>
      <AdminReports />
    </div>
  );
}
