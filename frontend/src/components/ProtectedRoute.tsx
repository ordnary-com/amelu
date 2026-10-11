import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { customer, loading } = useAuth();

  if (loading) return <p className="light" style={{ textAlign: "center", marginTop: "3rem" }}>Loading…</p>;
  if (!customer) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
