import React from "react";
import { InstallmentSection } from "@/features/installment/InstallmentSection";

export default function InstallmentPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Installment Management</h1>
        <p className="text-sm text-muted-foreground">Manage installment customers, payments, agents, and reports.</p>
      </header>
      <InstallmentSection />
    </div>
  );
}
