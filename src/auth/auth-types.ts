export type UserRole = "cashier" | "admin" | "waiter" | "supervisor";

export type AuthSession = {
  username: string;
  role: UserRole;
  createdAt: number;
};
