/**
 * PDF builder for installment reports summary.
 */
import jsPDF from "jspdf";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import type { Settings, StaffAccount } from "@/db/schema";
import { getCurrencySymbol } from "@/features/pos/format";

function fmt(n: number): string {
  const cs = getCurrencySymbol();
  return cs ? `${cs} ${Math.round(n).toLocaleString()}` : Math.round(n).toLocaleString();
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function buildInstallmentReportPdf(args: {
  customers: InstallmentCustomer[];
  payments: InstallmentPayment[];
  filteredPayments: InstallmentPayment[];
  agents: StaffAccount[];
  settings: Settings | null;
  from: string;
  to: string;
}): jsPDF {
  const { customers, payments, filteredPayments, agents, settings: s, from, to } = args;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 15;
  const currentMonth = getCurrentMonth();

  // Header
  doc.setFontSize(14);
  if (s?.restaurantName) {
    doc.text(s.restaurantName, 105, y, { align: "center" });
    y += 6;
  }
  if (s?.address) { doc.setFontSize(8); doc.text(s.address, 105, y, { align: "center" }); y += 4; }
  if (s?.phone) { doc.setFontSize(8); doc.text(s.phone, 105, y, { align: "center" }); y += 4; }

  doc.setFontSize(12);
  y += 2;
  doc.text("INSTALLMENT REPORT", 105, y, { align: "center" });
  y += 5;
  doc.setFontSize(8);
  doc.text(`Period: ${from} to ${to}`, 105, y, { align: "center" });
  y += 8;

  // Summary
  const totalCustomerBalance = customers.reduce((s, c) => s + c.totalBalance, 0);
  const totalRecoveryThisMonth = customers.reduce((s, c) => s + c.monthlyInstallment, 0);
  const recoveredThisMonth = payments.filter(p => p.month === currentMonth).reduce((s, p) => s + p.amount, 0);
  const pendingRecovery = Math.max(0, totalRecoveryThisMonth - recoveredThisMonth);
  const totalLateFee = filteredPayments.reduce((s, p) => s + (p.lateFeeAmount ?? 0), 0);
  const totalRecoveredInRange = filteredPayments.reduce((s, p) => s + p.amount, 0);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", 15, y); y += 5;
  doc.setFont("helvetica", "normal");

  const summaryRows = [
    ["All Customers Balance", fmt(totalCustomerBalance)],
    ["Recovery This Month", fmt(totalRecoveryThisMonth)],
    ["Recovered This Month", fmt(recoveredThisMonth)],
    ["Pending Recovery", fmt(pendingRecovery)],
    ["Total Late Fee", fmt(totalLateFee)],
    [`Recovered (${from} to ${to})`, fmt(totalRecoveredInRange)],
  ];

  for (const [label, value] of summaryRows) {
    doc.text(label, 15, y);
    doc.text(value, 120, y);
    y += 5;
  }

  // Agent performance
  if (agents.length > 0) {
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Agent Performance", 15, y); y += 5;
    doc.setFont("helvetica", "normal");

    for (const agent of agents) {
      if (y > 270) { doc.addPage(); y = 15; }
      const agentCustomers = customers.filter(c => c.agentId === agent.id);
      const agentPaymentsInRange = filteredPayments.filter(p =>
        agentCustomers.some(c => c.id === p.customerId)
      );
      const agentRecovered = agentPaymentsInRange.reduce((s, p) => s + p.amount, 0);
      const agentPending = agentCustomers
        .filter(c => !payments.some(p => p.customerId === c.id && p.month === currentMonth) && c.totalBalance > 0)
        .reduce((s, c) => s + c.monthlyInstallment, 0);

      let commission = 0;
      for (const c of agentCustomers) {
        const custPayments = agentPaymentsInRange.filter(p => p.customerId === c.id);
        for (const p of custPayments) {
          if (c.agentCommissionType === "percent" && c.agentCommissionValue) {
            commission += Math.round(p.amount * c.agentCommissionValue / 100);
          } else if (c.agentCommissionType === "fixed" && c.agentCommissionValue) {
            commission += c.agentCommissionValue;
          }
        }
      }

      doc.setFont("helvetica", "bold");
      doc.text(agent.name, 15, y); y += 4;
      doc.setFont("helvetica", "normal");
      doc.text(`Customers: ${agentCustomers.length}  |  Recovered: ${fmt(agentRecovered)}  |  Pending: ${fmt(agentPending)}  |  Commission: ${fmt(commission)}`, 15, y);
      y += 6;
    }
  }

  return doc;
}
