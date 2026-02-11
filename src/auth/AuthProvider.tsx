import React from "react";
import { authenticate } from "./auth";
import type { AuthSession, UserRole } from "./auth-types";

type AuthContextValue = {
  session: AuthSession | null;
  login: (args: { identifier: string; credential: string }) => Promise<{ ok: true; role: UserRole } | { ok: false }>;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<AuthSession | null>(null);

  const login = React.useCallback<AuthContextValue["login"]>(async ({ identifier, credential }) => {
    const result = await authenticate(identifier, credential);
    if (!result.ok) return result;

    const next: AuthSession = {
      username: result.displayName,
      role: result.role,
      createdAt: Date.now(),
    };
    setSession(next);
    return result;
  }, []);

  const logout = React.useCallback(() => {
    setSession(null);
  }, []);

  const value = React.useMemo<AuthContextValue>(() => ({ session, login, logout }), [session, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
