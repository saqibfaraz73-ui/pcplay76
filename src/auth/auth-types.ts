export type UserRole = "cashier" | "admin" | "waiter" | "supervisor" | "recovery" | "kitchen" | "installment_agent";

export type AuthSession = {
  username: string;
  role: UserRole;
  createdAt: number;
};
