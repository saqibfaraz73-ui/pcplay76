export type UserRole = "cashier" | "admin" | "waiter" | "supervisor" | "recovery";

export type AuthSession = {
  username: string;
  role: UserRole;
  createdAt: number;
};
