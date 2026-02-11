import { AdminPrinter } from "@/features/admin/printer/AdminPrinter";

export default function AdminPrinterPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Printer Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your thermal printer connection and receipt settings.</p>
      </header>
      <AdminPrinter />
    </div>
  );
}
