import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, Mail, BookOpen, Shield, Clock, AlertTriangle, RefreshCw, Database } from "lucide-react";

export default function HelpPage() {
  return (
    <div className="space-y-6 pb-20 pt-2">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <HelpCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Help & Support</h1>
          <p className="text-sm text-muted-foreground">All-in-one offline POS for any business</p>
        </div>
      </div>

      {/* Contact Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact Us</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            If you experience any issues, bugs, or need assistance with the app, please don't hesitate to reach out. Our support team is available to help you resolve any problems.
          </p>

          <a href="mailto:info@sangitech.com" className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Email Support</h3>
              <p className="text-xs text-muted-foreground">info@sangitech.com</p>
              <p className="text-xs text-muted-foreground">For detailed issues, feedback, or feature requests</p>
            </div>
          </a>

        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 rounded-lg border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">App Not Responding</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                If the app freezes or stops responding, try closing and reopening it. If the issue persists, clear the app cache from your device settings or reinstall the app. Your data will remain safe if you have a backup.
              </p>
            </div>
          </div>

          <div className="flex gap-3 rounded-lg border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <RefreshCw className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Printer Not Connecting</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Ensure Bluetooth is enabled and the printer is turned on. Go to Admin &gt; Printer to re-pair the device. Make sure no other app is connected to the printer at the same time.
              </p>
            </div>
          </div>

          <div className="flex gap-3 rounded-lg border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Data Loss Prevention</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Always keep regular backups of your data from Admin &gt; Settings &gt; Backup &amp; Restore. We strongly recommend backing up before updating the app or clearing storage.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Help Topics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 rounded-lg border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Initial Setup</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                After logging in, go to Admin &gt; Settings to set up your restaurant name, add categories, and create menu items. Then start taking orders from the Sales dashboard.
              </p>
            </div>
          </div>

          <div className="flex gap-3 rounded-lg border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Staff Accounts</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Create separate accounts for cashiers, waiters, supervisors, and recovery agents from Admin &gt; Settings &gt; Staff Accounts. Each role has specific permissions tailored to their tasks.
              </p>
            </div>
          </div>

          <div className="flex gap-3 rounded-lg border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Work Periods</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Start a work period at the beginning of each shift. All sales, expenses, and orders are tracked under that period. End the work period when the shift is over to view the summary.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Policies */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Privacy & Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>
            SANGI POS is a fully offline all-in-one point-of-sale application suitable for any business — shops, restaurants, pharmacies, salons, bakeries, wholesale stores, and more. All your business data including orders, customers, inventory, and financial records are stored locally on your device and are never uploaded to any external server.
          </p>
          <p>
            We do not collect, transmit, or share any personal or business data. Your information stays completely under your control. We recommend regular backups to protect against accidental data loss.
          </p>
          <p>
            For our full privacy policy, please visit the Privacy Policy page accessible from the login screen.
          </p>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground">
        We're here to help — reach out anytime!
      </div>
    </div>
  );
}
