import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

const Index = () => {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={session.role === "kitchen" ? "/kitchen" : "/home"} replace />;
};

export default Index;
