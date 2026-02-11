export type UserRole = "cashier" | "admin" | "waiter";

export type AuthSession = {
  username: string;
  role: UserRole;
  createdAt: number;
};
