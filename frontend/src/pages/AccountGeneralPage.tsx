import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";

export function AccountGeneralPage() {
  const { customer, setCustomer } = useAuth();
  const [firstName, setFirstName] = useState(customer?.firstName ?? "");
  const [lastName, setLastName] = useState(customer?.lastName ?? "");
  const [username, setUsername] = useState(customer?.username ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      setCustomer(await api.updateAccountProfile(firstName.trim(), lastName.trim(), username.trim()));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>General</h1>

      <form onSubmit={submit}>
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
