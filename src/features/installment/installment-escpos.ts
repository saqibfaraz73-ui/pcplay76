/**
 * ESC/POS receipt builder for installment payments.
 * Used for thermal printer output via default printer.
 */
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import type { Settings } from "@/db/schema";
import { getCurrencySymbol } from "@/features/pos/format";
import { buildTaxQrEscPos } from "@/features/tax/tax-qr";
import { getTaxLabel } from "@/features/tax/tax-calc";

function fmt(n: number): string {
  const cs = getCurrencySymbol();
  return cs ? `${cs} ${Math.round(n).toLocaleString()}` : Math.round(n).toLocaleString();
}

function fmtDt(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
}

const ESC = "\x1b";
const INIT = ESC + "@";
const CENTER = ESC + "a\x01";
const LEFT = ESC + "a\x00";
const BOLD_ON = ESC + "E\x01";
const BOLD_OFF = ESC + "E\x00";
const DOUBLE_ON = ESC + "!\x30"; // double height+width
const DOUBLE_OFF = ESC + "!\x00";
const CUT = "\x1d" + "V\x41\x03";
const LINE = "--------------------------------\n";

export function buildInstallmentReceiptEscPos(args: {
  customer: InstallmentCustomer;
  payment: InstallmentPayment;
  settings: Settings | null;
}): string {
  const { customer: c, payment: p, settings: s } = args;
  let out = INIT;

  // Header
  if (s?.restaurantName) {
    out += CENTER + DOUBLE_ON + s.restaurantName + "\n" + DOUBLE_OFF;
  }
  if (s?.address) out += CENTER + s.address + "\n";
  if (s?.phone) out += CENTER + s.phone + "\n";

  out += CENTER + BOLD_ON + "\nINSTALLMENT RECEIPT\n" + BOLD_OFF;
  out += LINE;
  out += LEFT;

  out += `Receipt #: ${p.receiptNo ?? "-"}\n`;
  out += `Date: ${fmtDt(p.createdAt)}\n`;
  out += `Customer: ${c.name}\n`;
  out += `Phone: ${c.phone}\n`;
  out += `Product: ${c.productName}\n`;
  out += `Month: ${p.month}\n`;
  out += LINE;

  out += BOLD_ON + `Payment:     ${fmt(p.amount)}\n` + BOLD_OFF;

  if (p.lateFeeAmount) {
    out += `Late Fee:    ${fmt(p.lateFeeAmount)}\n`;
  }
  if (p.taxAmount) {
    out += `Tax:         ${fmt(p.taxAmount)}\n`;
  }
  const totalCollected = p.amount + (p.lateFeeAmount ?? 0) + (p.taxAmount ?? 0);
  if (p.lateFeeAmount || p.taxAmount) {
    out += BOLD_ON + `Total:       ${fmt(totalCollected)}\n` + BOLD_OFF;
  }

  out += LINE;
  out += `Bal Before:  ${fmt(p.balanceBefore)}\n`;
  out += BOLD_ON + `Bal After:   ${fmt(p.balanceAfter)}\n` + BOLD_OFF;

  if (p.note) out += `\nNote: ${p.note}\n`;
  out += `\nReceived by: ${p.agentName}\n`;

  out += CENTER + "\nThank you for your payment!\n\n\n";
  out += CUT;

  return out;
}
