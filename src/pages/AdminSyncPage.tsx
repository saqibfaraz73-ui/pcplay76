import { SyncSettingsPanel } from "@/features/sync/SyncSettingsPanel";

export default function AdminSyncPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Device Sync</h1>
        <p className="text-sm text-muted-foreground">
          Connect multiple devices over local WiFi/hotspot to sync sales and share a printer.
        </p>
      </header>
      <SyncSettingsPanel />
    </div>
  );
}
