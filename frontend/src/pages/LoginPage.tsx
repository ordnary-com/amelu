import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

type Mode = "login" | "signup" | "signup-profile";

export function LoginPage() {
  const { customer, login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (customer) return <Navigate to="/domains" replace />;

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const continueToProfileStep = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMode("signup-profile");
  };

  const submitSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signup(email, password, organizationName, firstName, lastName, username);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered" style={{ minHeight: "100vh" }}>
      <form
        onSubmit={mode === "login" ? submitLogin : mode === "signup" ? continueToProfileStep : submitSignup}
        style={{ width: "24rem" }}
      >
        <p style={{ textAlign: "center" }}>
          <img src="/amelu-logo.png" alt="Amelu" className="registration-logo" style={{ height: "2rem", margin: "0 auto 2rem" }} />
        </p>

        {mode === "signup-profile" ? (
          <>
            <p className="introduction" style={{ textAlign: "center" }}>
              Tell us a bit about yourself.
            </p>
            <p>
              <label htmlFor="first-name">
                <span>First name</span>
                <input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </label>
            </p>
            <p>
              <label htmlFor="last-name">
                <span>Last name</span>
                <input
                  id="last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </label>
            </p>
            <p>
              <label htmlFor="username">
                <span>Username</span>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </label>
            </p>
          </>
        ) : (
          <>
            {mode === "signup" && (
              <p>
                <label htmlFor="organization-name">
                  <span>Organization name</span>
                  <input
                    id="organization-name"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    required
                    style={{ width: "100%" }}
                  />
                </label>
              </p>
            )}

            <p>
              <label htmlFor="email">
                <span>Email</span>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </label>
            </p>
            <p>
              <label htmlFor="password">
                <span>Password</span>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  style={{ width: "100%" }}
                />
              </label>
            </p>
          </>
        )}

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        <div className="action">
          <button className="button green" type="submit" disabled={busy} style={{ width: "100%" }}>
            {mode === "login" ? "Sign in" : mode === "signup" ? "Continue" : "Create account"}
          </button>
        </div>

        <p style={{ textAlign: "center" }}>
          {mode === "login" ? (
            <>
              New to Amelu? <a onClick={() => setMode("signup")}>Create an account</a>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <a
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                Sign in
              </a>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
