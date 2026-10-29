import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { ConnectionOverlay } from "./ConnectionOverlay";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { customer, loading } = useAuth();

  // Same blue as the header and sidebar the page is about to render, so the
  // session check reads as the app starting rather than a blank page with a
  // stray line of text, and there's no flash when the layout swaps in.
  if (loading) {
    return (
      <>
        <div className="app-loading" role="progressbar" aria-label="Loading" />
        <ConnectionOverlay />
      </>
    );
  }
  if (!customer) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
