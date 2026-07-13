import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Customer } from "../api/client";

interface AuthState {
  customer: Customer | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    organizationName: string,
    firstName: string,
    lastName: string,
    username: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  setCustomer: (customer: Customer) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Session identity lives only in React state for this render tree, backed
// by the server's httpOnly session cookie, never localStorage/sessionStorage.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setCustomer)
      .catch(() => setCustomer(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    setCustomer(await api.login(email, password));
  };
  const signup = async (
    email: string,
    password: string,
    organizationName: string,
    firstName: string,
    lastName: string,
    username: string,
  ) => {
    setCustomer(await api.signup(email, password, organizationName, firstName, lastName, username));
  };
  const logout = async () => {
    await api.logout();
    setCustomer(null);
  };
  const refresh = async () => {
    setCustomer(await api.me());
  };

  return (
    <AuthContext.Provider value={{ customer, loading, login, signup, logout, setCustomer, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
