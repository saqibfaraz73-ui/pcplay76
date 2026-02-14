import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

const Index = () => {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role === "admin") return <Navigate to="/admin" replace />;
  if (session.role === "waiter" || session.role === "supervisor") return <Navigate to="/pos/tables" replace />;
  return <Navigate to="/pos" replace />;
};

export default Index;
