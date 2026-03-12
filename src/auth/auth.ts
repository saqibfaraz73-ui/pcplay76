import type { AuthSession, UserRole } from "./auth-types";
import { db } from "@/db/appDb";

/**
 * Check if admin has registered (first-time setup completed)
 */
export async function isAdminRegistered(): Promise<boolean> {
  const admin = await db.adminAccount.get("admin");
  return !!admin;
}

/**
 * Register the admin account (first-time setup)
 */
export async function registerAdmin(name: string, phone: string, password: string, securityQuestion: string, securityAnswer: string): Promise<void> {
  await db.adminAccount.put({
    id: "admin",
    name: name.trim(),
    phone: phone.trim(),
    password: password.trim(),
    securityQuestion: securityQuestion.trim(),
    securityAnswer: securityAnswer.trim().toLowerCase(),
    createdAt: Date.now(),
  });
}

/**
 * Verify security answer to recover password
 */
export async function verifySecurityAnswer(answer: string): Promise<{ ok: true; password: string } | { ok: false }> {
  const admin = await db.adminAccount.get("admin");
  if (!admin) return { ok: false };
  if (answer.trim().toLowerCase() === admin.securityAnswer) {
    return { ok: true, password: admin.password };
  }
  return { ok: false };
}

/**
 * Verify security answer to recover username (admin name)
 */
export async function verifySecurityAnswerForUsername(answer: string): Promise<{ ok: true; name: string } | { ok: false }> {
  const admin = await db.adminAccount.get("admin");
  if (!admin) return { ok: false };
  if (answer.trim().toLowerCase() === admin.securityAnswer) {
    return { ok: true, name: admin.name };
  }
  return { ok: false };
}

/**
 * Get the security question (to display on forgot password screen)
 */
export async function getSecurityQuestion(): Promise<string | null> {
  const admin = await db.adminAccount.get("admin");
  return admin?.securityQuestion ?? null;
}

/** Master reset PIN - wipes admin account so user can re-register */
const MASTER_RESET_PIN = "999999";

export async function masterReset(pin: string): Promise<boolean> {
  if (pin !== MASTER_RESET_PIN) return false;
  await db.adminAccount.delete("admin");
  await db.staffAccounts.clear();
  return true;
}

/**
 * Authenticate user against local DB.
 * Admin logs in with phone + password.
 * Staff (cashier/waiter) logs in with name + 4-digit PIN.
 */
export async function authenticate(
  identifier: string,
  credential: string
): Promise<{ ok: true; role: UserRole; displayName: string } | { ok: false }> {
  // Check admin account (phone or name + password)
  const admin = await db.adminAccount.get("admin");
  if (admin && (identifier === admin.phone || identifier.toLowerCase() === admin.name.toLowerCase()) && credential === admin.password) {
    return { ok: true, role: "admin", displayName: admin.name };
  }

  // Check staff accounts (name or phone + PIN)
  const staff = await db.staffAccounts.toArray();
  const match = staff.find(
    (s) =>
      (s.name.toLowerCase() === identifier.toLowerCase() ||
        (s.phone && s.phone === identifier.trim())) &&
      s.pin === credential
  );
  if (match) {
    return { ok: true, role: match.role as UserRole, displayName: match.name };
  }

  return { ok: false };
}

export function canAccessAdmin(session: AuthSession | null): boolean {
  return session?.role === "admin";
}

export function canAccessPOS(session: AuthSession | null): boolean {
  return session?.role === "admin" || session?.role === "cashier" || session?.role === "waiter" || session?.role === "supervisor" || session?.role === "recovery";
}
