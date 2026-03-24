import DaybookSection from "@/features/daybook/DaybookSection";

export default function DaybookPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Daybook</h1>
        <p className="text-sm text-muted-foreground">Track cash, bank accounts, payments & spendings.</p>
      </header>
      <DaybookSection />
    </div>
  );
}
