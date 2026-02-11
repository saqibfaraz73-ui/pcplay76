import type { AuthSession } from "./auth-types";

const AUTH_STORAGE_KEY = "sangi_pos.auth.session.v1";

export function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function writeSession(session: AuthSession | null) {
  // In some WebViews (certain Android builds / strict privacy modes), localStorage can throw.
  // We never want auth persistence to crash the app.
  try {
    if (!session) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}
