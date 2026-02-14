import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { UserRole } from "@/auth/auth-types";
import { useAuth } from "@/auth/AuthProvider";

export function ProtectedRoute({ allow, children }: { allow: UserRole[]; children: React.ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!allow.includes(session.role)) {
    return <Navigate to={session.role === "waiter" || session.role === "supervisor" ? "/pos/tables" : "/pos"} replace />;
  }
  return <>{children}</>;
}
