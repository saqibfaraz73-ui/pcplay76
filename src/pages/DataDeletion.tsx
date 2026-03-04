import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const DataDeletion = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <h1 className="text-2xl font-bold mb-2">Delete Your Account & Data</h1>
      <p className="text-muted-foreground mb-6">Sangi POS — SangiTech</p>

      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-6 text-sm leading-relaxed">
        <p className="font-semibold text-destructive mb-1">Important</p>
        <p>
          Sangi POS is a fully <strong>offline</strong> application. All your data — including
          sales, orders, inventory, expenses, customer records, and settings — is stored{" "}
          <strong>only on your device</strong>. We do not have access to your data on any server.
          Therefore, you can delete all your data directly from your device at any time.
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-3">Steps to Delete Your Data</h2>
          <p className="mb-3">You can delete all your Sangi POS data using any of these methods:</p>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-4">
            <p className="font-semibold text-primary mb-1">Selective Data Deletion — No Account Deletion Required</p>
            <p>
              You do <strong>not</strong> need to delete your account or uninstall the app to remove
              your data. Sangi POS provides a built-in <strong>Data Cleanup</strong> feature that lets
              you selectively delete specific types of data while keeping the rest. For example, you
              can delete only your order history while keeping your product catalog and customer records
              intact.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <p className="font-semibold mb-1">Option 1 — Selective Cleanup From Within the App</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Open Sangi POS</li>
                <li>Go to <strong>Admin → Settings</strong></li>
                <li>Tap <strong>Data Cleanup</strong></li>
                <li>Choose which data to delete individually:
                  <ul className="list-disc pl-5 mt-1 space-y-0.5">
                    <li>Sales &amp; order records</li>
                    <li>Expense records</li>
                    <li>Inventory &amp; product data</li>
                    <li>Customer records</li>
                    <li>Booking &amp; advance records</li>
                    <li>Or select <strong>all data</strong> to clear everything</li>
                  </ul>
                </li>
                <li>Confirm the deletion — selected data is removed immediately and permanently</li>
              </ol>
            </div>

            <div className="rounded-lg border border-border p-4">
              <p className="font-semibold mb-1">Option 2 — From Android Settings</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Open your device <strong>Settings</strong></li>
                <li>Go to <strong>Apps</strong> (or <strong>Applications</strong>)</li>
                <li>Find and tap <strong>Sangi POS</strong></li>
                <li>Tap <strong>Storage</strong></li>
                <li>Tap <strong>Clear Data</strong> — this removes all app data permanently</li>
              </ol>
            </div>

            <div className="rounded-lg border border-border p-4">
              <p className="font-semibold mb-1">Option 3 — Uninstall the App</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Long-press the <strong>Sangi POS</strong> icon on your home screen</li>
                <li>Tap <strong>Uninstall</strong></li>
                <li>All app data is permanently deleted from your device</li>
              </ol>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">What Data Is Deleted</h2>
          <p className="mb-2">When you delete your data using any of the above methods, the following is <strong>permanently removed</strong> from your device:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>All sales and order records</li>
            <li>All expense records</li>
            <li>All inventory and product data</li>
            <li>All customer records</li>
            <li>All booking and advance records</li>
            <li>All table and waiter configurations</li>
            <li>App settings and preferences</li>
            <li>PIN and authentication data</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">What Data Is Retained</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>No data is retained by us</strong> — Since all data is stored locally on your
              device and we do not have any servers that store your data, once deleted, it cannot
              be recovered by us or anyone else.
            </li>
            <li>
              <strong>Backup files</strong> — If you previously exported backup files to your
              device storage, those files remain on your device until you manually delete them.
            </li>
            <li>
              <strong>Google Play / RevenueCat</strong> — If you purchased a premium subscription,
              your subscription record is managed by Google Play and RevenueCat. To cancel your
              subscription, go to Google Play Store → Subscriptions. RevenueCat retains anonymized
              transaction data per their{" "}
              <a href="https://www.revenuecat.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                privacy policy
              </a>.
            </li>
            <li>
              <strong>Google AdMob</strong> — Any advertising data collected by AdMob is managed
              by Google per their{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                privacy policy
              </a>. You can reset your advertising ID from your device settings.
            </li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            There is <strong>no additional retention period</strong> for locally stored data.
            Deletion is immediate and permanent.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Need Help?</h2>
          <p>
            If you need assistance with data deletion or have any questions, contact us at:{" "}
            <a href="mailto:info@sangitech.com" className="text-primary underline">
              info@sangitech.com
            </a>
          </p>
        </section>
      </div>

      <div className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground text-center">
        © {new Date().getFullYear()} Sangi POS — SangiTech. All rights reserved.
      </div>
    </div>
  );
};

export default DataDeletion;
