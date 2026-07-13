import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";

export function AccountEmailPage() {
  const { customer, setCustomer } = useAuth();
  const [email, setEmail] = useState(customer?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      setCustomer(await api.updateAccountEmail(email.trim(), currentPassword));
      setCurrentPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Sign-in Email</h1>
      <p>Changing your sign-in email requires your current password.</p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Email"
            type="email"
            value={email}
            onInput={(e) => setEmail((e.target as unknown as { value: string }).value)}
            required
          />
        </div>
        <div className="field">
          <md-outlined-text-field
            label="Current password"
            type="password"
            autocomplete="current-password"
            value={currentPassword}
            onInput={(e) => setCurrentPassword((e.target as unknown as { value: string }).value)}
            required
          />
        </div>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="alert alert-info">
            <span>Saved.</span>
          </div>
        )}

        <div className="field-action">
          <md-filled-button type="submit" disabled={busy}>
            Save
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
