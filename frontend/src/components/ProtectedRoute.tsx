import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { customer, loading } = useAuth();

  if (loading) return null;
  if (!customer) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
