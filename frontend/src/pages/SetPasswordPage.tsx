import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function SetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .getPasswordResetToken(token)
      .then((r) => {
        if (r.valid && r.address) {
          setAddress(r.address);
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  if (!token) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.completePasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not set password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered" style={{ minHeight: "100vh" }}>
      <div style={{ width: "24rem" }}>
        <p style={{ textAlign: "center" }}>
          <img
            src="/amelu-logo.png"
            alt="Amelu"
            className="registration-logo"
            style={{ height: "2rem", margin: "0 auto 2rem" }}
          />
        </p>

        {status === "loading" && <p className="light" style={{ textAlign: "center" }}>Loading…</p>}

        {status === "invalid" && (
          <div className="alert alert-error">
            <span>This link is invalid or has expired. Ask for a new one to be sent.</span>
          </div>
        )}

        {status === "valid" && !done && (
          <form onSubmit={submit}>
            <p style={{ textAlign: "center" }}>
              Set a password for <strong>{address}</strong>
            </p>
            <p>
              <label htmlFor="new-password">
                <span>Password</span>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  style={{ width: "100%" }}
                />
              </label>
            </p>

            {error && (
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            )}

            <div className="action">
              <button className="button green" type="submit" disabled={busy} style={{ width: "100%" }}>
                Set Password
              </button>
            </div>
          </form>
        )}

        {status === "valid" && done && (
          <div className="alert alert-info">
            <span>Password set. You can now sign in to {address} using your mail client.</span>
          </div>
        )}
      </div>
    </div>
  );
}
