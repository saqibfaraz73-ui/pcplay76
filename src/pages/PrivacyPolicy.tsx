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
      <p className="text-muted-foreground mb-4">Last updated: February 19, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Introduction</h2>
          <p>
            Sangi POS ("we", "our", "the app") is a point-of-sale application designed for
            restaurants, shops, and small businesses. This Privacy Policy explains how we handle
            your information when you use our application.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Data Collection & Storage</h2>
          <p>
            All business data — including sales, orders, inventory, expenses, customer records,
            and settings — is stored <strong>locally on your device only</strong>. We do{" "}
            <strong>not</strong> collect, transmit, upload, or store any of your data on our
            servers or any external server. We have no servers that receive your data.
          </p>
          <p className="mt-2">
          When using the optional P2P Sync feature, data is transferred directly between your
            own devices over your local WiFi or hotspot network. No data passes through our
            servers at any point.
          </p>
          <p className="mt-2">
            We do <strong>not</strong> collect, log, or store your IP address or any network
            identifiers. Your device's local IP address is used only within your own local
            network for the optional P2P sync feature and is never transmitted to us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Permissions We Use</h2>
          <p className="mb-2 text-muted-foreground">
            All permissions listed below are used solely for app functionality. No data collected
            through these permissions is sent to us or any third party.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Internet & Network Access</strong> — Used only for the optional local
              device-to-device sync feature (P2P sync over WiFi/hotspot). The app works fully
              offline without this permission.
            </li>
            <li>
              <strong>Bluetooth & Bluetooth Admin</strong> — Used exclusively to discover and
              connect to Bluetooth thermal receipt printers. No data is transmitted over
              Bluetooth other than receipt print jobs.
            </li>
            <li>
              <strong>USB Host (OTG)</strong> — Used exclusively to connect to USB thermal
              receipt printers via an OTG cable. No other USB data is read or written.
            </li>
            <li>
              <strong>Location (Approximate)</strong> — Required by Android OS to scan for
              nearby Bluetooth devices. We do <strong>not</strong> track, record, or store your
              location at any time.
            </li>
            <li>
              <strong>Storage / Files</strong> — Used to read and write backup files and
              exported PDF/Excel reports on your device. Files are saved to your device's local
              storage only.
            </li>
            <li>
              <strong>Camera</strong> — Used to scan product barcodes within the app. Camera
              images are not stored or transmitted.
            </li>
            <li>
              <strong>Vibrate</strong> — Used for optional beep/vibration feedback on barcode
              scans.
            </li>
            <li>
              <strong>Receive Boot Completed</strong> — Used to restore app state after device
              restart if applicable.
            </li>
            <li>
              <strong>Foreground Service</strong> — Used to keep the local sync server running
              in the background when P2P sync is active, so sync is not interrupted.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. No Data Shared with Third Parties</h2>
          <p>
            We do not share, sell, or transfer any of your data to any third party. The app does
            not integrate with any external analytics, advertising, or tracking services.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Google Play Billing</h2>
          <p>
            If you purchase a premium subscription, the payment is processed entirely by Google
            Play. We do not receive or store any payment information. Google Play's own privacy
            policy governs that transaction.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Data Security</h2>
          <p>
            Your data is protected by your device's built-in security. The app uses PIN-based
            authentication for access control. Backup files are stored locally and are fully
            under your control. We recommend regular backups to protect against data loss.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Children's Privacy</h2>
          <p>
            This app is a business tool and is not directed at children under 13. We do not
            knowingly collect any personal information from children.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Data Deletion</h2>
          <p>
            You can delete all app data at any time by clearing the app's storage from your
            device settings, or by using the Backup &amp; Restore feature within the app. Since
            all data is local, uninstalling the app removes all data permanently.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be reflected
            in the app with an updated "Last updated" date.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at:{" "}
            <a href="mailto:sangiaipos@gmail.com" className="text-primary underline">
              sangiaipos@gmail.com
            </a>
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
