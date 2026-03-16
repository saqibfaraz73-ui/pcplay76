// ─── Installment Management Schema ────────────────────

export type ProfitType = "fixed" | "percent";
export type InstallmentFrequency = "weekly" | "monthly" | "yearly";
export type InstallmentCustomerStatus = "active" | "cleared" | "defaulter";

export type InstallmentCustomerField = {
  name: string;
  value: string;
};

export type InstallmentCustomer = {
  id: string;
  name: string;
  phone: string;
  address?: string;
  whatsapp?: string;
  email?: string;
  customFields?: InstallmentCustomerField[];
  /** base64 data URIs for product images / documents */
  images?: string[];

  // Product details
  productName: string;
  marketPrice?: number;
  profitType: ProfitType;
  profitValue: number; // fixed amount or percentage
  tenureMonths: number; // total months (if user picks years, convert)
  monthlyInstallment: number; // auto-calculated (per-period amount)
  totalPrice: number; // auto-calculated (market + profit)
  totalBalance: number; // remaining balance (decreases on payment)

  // Installment frequency
  frequency?: InstallmentFrequency; // defaults to "monthly" if not set

  // Due date & late fee
  dueDate?: number; // day of month (1-28) when installment is due
  lateFeePerDay?: number; // per-day late fee

  // Agent assignment
  agentId?: string;
  agentName?: string;
  agentCommissionType?: "percent" | "fixed"; // per collection
  agentCommissionValue?: number;

  createdAt: number;
};

export type InstallmentPayment = {
  id: string;
  customerId: string;
  receiptNo?: number;
  amount: number; // payment amount (excluding late fee)
  lateFeeAmount?: number; // late fee charged on this payment
  balanceBefore: number;
  balanceAfter: number;
  agentName: string; // who recorded
  note?: string;
  month: string; // "YYYY-MM" for which month
  createdAt: number;
};
