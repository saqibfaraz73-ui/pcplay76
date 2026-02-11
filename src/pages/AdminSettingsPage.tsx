import { AdminSettings } from "@/features/admin/settings/AdminSettings";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Restaurant, receipt, and account settings.</p>
      </header>
      <AdminSettings />
    </div>
  );
}
