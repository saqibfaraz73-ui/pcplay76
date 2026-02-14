import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <h1 className="text-2xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-muted-foreground mb-4">Last updated: February 14, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Introduction</h2>
          <p>
            Sangi POS ("we", "our", "the app") is a point-of-sale application designed for
            restaurants, shops, and small businesses. This Privacy Policy explains how we collect,
            use, and protect your information when you use our application.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Data Collection & Storage</h2>
          <p>
            All business data (sales, orders, inventory, expenses, customer records) is stored
            <strong> locally on your device</strong> using an offline-first database. We do{" "}
            <strong>not</strong> upload your business data to any external server or cloud service.
          </p>
          <p className="mt-2">
            When using the optional P2P Sync feature, data is transferred directly between your
            devices over your local WiFi or hotspot network. No data passes through our servers.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Permissions We Use</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Internet & Network</strong> — Required for the local device sync feature and
              app updates.
            </li>
            <li>
              <strong>Bluetooth</strong> — Used to connect to Bluetooth thermal receipt printers.
            </li>
            <li>
              <strong>USB (OTG)</strong> — Used to connect to USB thermal receipt printers via OTG
              cable.
            </li>
            <li>
              <strong>Location</strong> — Required by Android to scan for nearby Bluetooth devices.
              We do <strong>not</strong> track or store your location.
            </li>
            <li>
              <strong>Storage</strong> — Used to export/import backup files and reports.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Third-Party Services</h2>
          <p>
            This app does not integrate with third-party analytics, advertising, or tracking
            services. No personal data is shared with third parties.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Data Security</h2>
          <p>
            Your data is protected by your device's built-in security. The app uses PIN-based
            authentication for access control. Backup files are stored locally and can be managed
            by you at any time.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Children's Privacy</h2>
          <p>
            This app is a business tool and is not directed at children under 13. We do not
            knowingly collect personal information from children.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Data Deletion</h2>
          <p>
            You can delete all app data at any time by clearing the app's storage from your device
            settings, or by using the backup/restore feature within the app to manage your data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be reflected in
            the app with an updated "Last updated" date.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us through the app
            support channel.
          </p>
        </section>
      </div>

      <div className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground text-center">
        © {new Date().getFullYear()} Sangi POS. All rights reserved.
      </div>
    </div>
  );
};

export default PrivacyPolicy;
