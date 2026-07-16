import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { setCustomer } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .getInvitation(token)
      .then((r) => {
        if (r.valid && r.email) {
          setEmail(r.email);
          setRole(r.role ?? "");
          setOrganizationName(r.organizationName ?? "");
          setExistingAccount(!!r.existingAccount);
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
      const customer = await api.acceptInvitation(token, password, firstName, lastName, username);
      setCustomer(customer);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept invitation");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered" style={{ minHeight: "100vh" }}>
      <div style={{ width: "26rem" }}>
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
            <span>This invitation is invalid, expired, or has already been used. Ask for a new one to be sent.</span>
          </div>
        )}

        {status === "valid" && existingAccount && (
          <div className="alert alert-warning">
            <span>
              An Amelu account already exists for <strong>{email}</strong>. Amelu doesn't yet support one account
              belonging to more than one organization - log in with that account instead.
            </span>
          </div>
        )}

        {status === "valid" && !existingAccount && (
          <form onSubmit={submit}>
            <p style={{ textAlign: "center" }}>
              Join <strong>{organizationName}</strong> on Amelu as <strong>{email}</strong> ({role})
            </p>

            <div className="field">
              <md-outlined-text-field
                label="First name"
                value={firstName}
                onInput={(e) => setFirstName((e.target as unknown as { value: string }).value)}
                required
              />
            </div>
            <div className="field">
              <md-outlined-text-field
                label="Last name"
                value={lastName}
                onInput={(e) => setLastName((e.target as unknown as { value: string }).value)}
                required
              />
            </div>
            <div className="field">
              <md-outlined-text-field
                label="Username"
                value={username}
                onInput={(e) => setUsername((e.target as unknown as { value: string }).value)}
                required
              />
            </div>
            <div className="field">
              <md-outlined-text-field
                label="Password"
                type="password"
                autocomplete="new-password"
                value={password}
                onInput={(e) => setPassword((e.target as unknown as { value: string }).value)}
                minlength={8}
                required
              />
            </div>

            {error && (
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            )}

            <div className="field-action">
              <md-filled-button type="submit" disabled={busy} style={{ width: "100%" }}>
                Accept Invitation
              </md-filled-button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
