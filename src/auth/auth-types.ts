export type UserRole = "cashier" | "admin" | "waiter" | "supervisor" | "recovery" | "kitchen";

export type AuthSession = {
  username: string;
  role: UserRole;
  createdAt: number;
};
