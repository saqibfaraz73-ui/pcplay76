import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, Mail, Phone, MessageCircle, BookOpen, Shield, Clock } from "lucide-react";

export default function HelpPage() {
  return (
    <div className="space-y-6 pb-20 pt-2">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <HelpCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Help & Support</h1>
          <p className="text-sm text-muted-foreground">Get assistance with SANGI POS</p>
        </div>
      </div>

      {/* Contact Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact Us</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <a href="mailto:support@sangipos.com" className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Email Support</h3>
              <p className="text-xs text-muted-foreground">support@sangipos.com</p>
            </div>
          </a>

          <a href="https://wa.me/923001234567" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-green-500/10">
              <MessageCircle className="h-4 w-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">WhatsApp</h3>
              <p className="text-xs text-muted-foreground">+92 300 1234567</p>
            </div>
          </a>

          <a href="tel:+923001234567" className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Phone</h3>
              <p className="text-xs text-muted-foreground">+92 300 1234567</p>
            </div>
          </a>
        </CardContent>
      </Card>

      {/* Help Topics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Common Help Topics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 rounded-lg border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Getting Started</h3>
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
              <h3 className="text-sm font-semibold">Data Backup</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Regularly back up your data from Admin &gt; Settings &gt; Backup &amp; Restore. This saves all your orders, menu items, customers, and settings to a file you can restore later.
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
                Start a work period at the beginning of each shift. All sales, expenses, and orders will be tracked under that period. End the work period when the shift is over to view the summary.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground">
        We're here to help — reach out anytime!
      </div>
    </div>
  );
}
