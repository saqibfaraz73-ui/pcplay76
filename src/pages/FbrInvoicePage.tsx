import FbrInvoiceSection from "@/features/tax/FbrInvoiceSection";

export default function FbrInvoicePage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">FBR Tax Invoice</h1>
        <p className="text-sm text-muted-foreground">Generate FBR-compliant tax invoices with PDF and Excel export.</p>
      </header>
      <FbrInvoiceSection />
    </div>
  );
}
