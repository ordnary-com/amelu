import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, api, type Customer } from "../api/client";

// "slow" once the first session check runs long (usually the API waking up),
// "unreachable" once retries ran out; checks keep going in the background.
export type Connection = "ok" | "slow" | "unreachable";

interface AuthState {
  customer: Customer | null;
  loading: boolean;
  connection: Connection;
  retryConnection: () => void;
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

const SLOW_AFTER_MS = 6_000;
const ATTEMPT_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const UNREACHABLE_POLL_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Session identity lives only in React state for this render tree, backed
// by the server's httpOnly session cookie, never localStorage/sessionStorage.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<Connection>("ok");
  const [attempt, setAttempt] = useState(0);

  // Only a 4xx means signed out. A timeout, network error or 5xx is the API
  // still starting up or down, and sending the customer to /login for that
  // flashed the login page at people whose session was fine.
  useEffect(() => {
    let cancelled = false;
    const slowTimer = setTimeout(() => setConnection((c) => (c === "ok" ? "slow" : c)), SLOW_AFTER_MS);

    (async () => {
      for (let i = 0; !cancelled; i++) {
        try {
          const me = await api.me(AbortSignal.timeout(ATTEMPT_TIMEOUT_MS));
          if (cancelled) return;
          setCustomer(me);
          break;
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiError && err.status < 500) {
            setCustomer(null);
            break;
          }
          if (i >= RETRY_DELAYS_MS.length) setConnection("unreachable");
          await sleep(RETRY_DELAYS_MS[i] ?? UNREACHABLE_POLL_MS);
        }
      }
      if (cancelled) return;
      clearTimeout(slowTimer);
      setConnection("ok");
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [attempt]);

  const retryConnection = () => {
    setConnection("slow");
    setAttempt((n) => n + 1);
  };

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
    <AuthContext.Provider value={{ customer, loading, connection, retryConnection, login, signup, logout, setCustomer, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
