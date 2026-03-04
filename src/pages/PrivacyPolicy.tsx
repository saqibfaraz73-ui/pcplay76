import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/home")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <h1 className="text-2xl font-bold mb-6">Privacy Policy — Sangi POS</h1>
      <p className="text-muted-foreground mb-4">Last updated: March 4, 2026</p>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-6 text-sm leading-relaxed">
        <p className="font-semibold text-primary mb-1">Our Core Commitment</p>
        <p>
          Sangi POS is a fully <strong>offline</strong> point-of-sale application. All data is stored
          locally on your device. We do <strong>not</strong> collect, transmit, or store any of your
          personal or business data on our servers or any third-party servers. All permissions
          requested are <strong>solely for app functionality</strong>.
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Introduction</h2>
          <p>
            Sangi POS ("we", "our", "us", "the app") is an all-in-one offline point-of-sale
            application designed for businesses of all types — retail shops, restaurants, pharmacies,
            salons, bakeries, wholesalers, and more. This Privacy Policy explains how we handle
            information when you use our application, in compliance with Google Play Store policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Data Collection & Storage</h2>
          <p>
            All business data — including sales, orders, inventory, expenses, customer records,
            and settings — is stored <strong>locally on your device only</strong> using an on-device
            database. We do <strong>not</strong> collect, transmit, upload, or store any of your
            data on our servers or any external server. We have no servers that receive your data.
          </p>
          <p className="mt-2">
            When using the optional P2P Sync feature, data is transferred directly between your
            own devices over your local WiFi or hotspot network. No data passes through our
            servers or any third-party servers at any point.
          </p>
          <p className="mt-2">
            Aside from the necessary identifiers used by the third-party services listed in
            Section 4 (RevenueCat and AdMob) for subscription and ad functionality, we do{" "}
            <strong>not</strong> collect, log, or store your device identifiers or IP address on
            our own servers. Your device's local IP address is used only within your own local
            network for the optional P2P sync feature and is never transmitted to us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Permissions We Use</h2>
          <p className="mb-2 text-muted-foreground">
            All permissions listed below are used <strong>solely for app functionality</strong>.
            No data collected through these permissions is sent to us or any third party.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Internet & Network Access</strong> — Used for: (1) the optional local
              device-to-device P2P sync feature over WiFi/hotspot, (2) in-app subscription
              management via RevenueCat, and (3) displaying ads via Google AdMob. The core POS
              functionality works fully offline without internet.
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
              location at any time. This permission is never used for location-based services.
            </li>
            <li>
              <strong>Storage / Files</strong> — Used to read and write backup files and
              exported PDF/Excel reports on your device. Files are saved to your device's local
              storage only and are never uploaded.
            </li>
            <li>
              <strong>Camera</strong> — Used solely to scan product barcodes within the app.
              Camera images are not stored, processed, or transmitted.
            </li>
            <li>
              <strong>Vibrate</strong> — Used for optional haptic feedback on barcode scans.
            </li>
            <li>
              <strong>Receive Boot Completed</strong> — Used to restore app state after device
              restart if applicable.
            </li>
            <li>
              <strong>Foreground Service</strong> — Used to keep the local P2P sync server
              running in the background when sync is active, so synchronization between your
              own devices is not interrupted.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Third-Party Services</h2>
          <p className="mb-2">
            The app integrates the following third-party services. These services may collect
            limited data as described below, governed by their own privacy policies:
          </p>
          <ul className="list-disc pl-5 space-y-3">
            <li>
              <strong>RevenueCat (Subscription Management)</strong> — We use RevenueCat to manage
              in-app premium subscriptions. RevenueCat processes subscription transactions through
              Google Play Billing and may collect anonymized purchase data, device identifiers,
              and transaction information solely for subscription management purposes. RevenueCat
              does <strong>not</strong> have access to your business data, sales records, or any
              content you create in the app.{" "}
              <a
                href="https://www.revenuecat.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                RevenueCat Privacy Policy
              </a>
            </li>
            <li>
              <strong>Google Play Billing</strong> — If you purchase a premium subscription, the
              payment is processed entirely by Google Play. We do not receive or store any payment
              or financial information. Google Play's own privacy policy governs that transaction.{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Google Privacy Policy
              </a>
            </li>
            <li>
              <strong>Google AdMob (Advertisements)</strong> — The app displays ads through Google
              AdMob. AdMob may collect device information, advertising identifiers, and usage data
              to serve relevant advertisements. Ad data collection is governed by Google's privacy
              policy. You can manage your ad preferences through your device's Google settings.{" "}
              <a
                href="https://policies.google.com/technologies/ads"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Google Ads Policy
              </a>
            </li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            Apart from these services, we do not share, sell, or transfer any of your data to
            any other third party. The app does not integrate with any other external analytics
            or tracking services.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Data Security</h2>
          <p>
            Your data is protected by your device's built-in security features. The app uses
            PIN-based authentication for access control. Backup files are stored locally and are
            fully under your control. We recommend regular backups to protect against data loss.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Data Retention & Deletion</h2>
          <p>
            Since all data is stored locally on your device, you have full control over your data
            at all times. You can delete all app data by:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Clearing the app's storage from your device Settings → Apps → Sangi POS → Clear Data</li>
            <li>Using the Data Cleanup feature within the app's Admin settings</li>
            <li>Uninstalling the app, which permanently removes all data</li>
          </ul>
          <p className="mt-2">
            For data managed by third-party services (RevenueCat, Google), please refer to their
            respective privacy policies for data retention and deletion procedures.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Children's Privacy</h2>
          <p>
            This app is a business tool and is not directed at children under the age of 13. We
            do not knowingly collect any personal information from children. If you believe a
            child has provided personal information through the app, please contact us and we
            will take steps to address the concern.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Your Rights</h2>
          <p>
            Since we do not collect or store any personal data on our servers, there is no personal
            data for us to access, modify, or delete. All your data resides on your device and is
            fully under your control.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be reflected
            in the app and on our website with an updated "Last updated" date. We encourage you
            to review this policy periodically.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Contact Us</h2>
          <p>
            If you have any questions, concerns, or requests regarding this Privacy Policy,
            please contact us at:{" "}
            <a href="mailto:info@sangitech.com" className="text-primary underline">
              info@sangitech.com
            </a>
          </p>
          <p className="mt-2">
            Website:{" "}
            <a
              href="https://sangitech.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              sangitech.com
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

export default PrivacyPolicy;
