import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";

export function AccountPasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.updateAccountPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Password</h1>

      <form onSubmit={submit}>
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
        <div className="field">
          <md-outlined-text-field
            label="New password"
            type="password"
            autocomplete="new-password"
            value={newPassword}
            onInput={(e) => setNewPassword((e.target as unknown as { value: string }).value)}
            minlength={8}
            required
          />
        </div>
        <div className="field">
          <md-outlined-text-field
            label="Confirm new password"
            type="password"
            autocomplete="new-password"
            value={confirmPassword}
            onInput={(e) => setConfirmPassword((e.target as unknown as { value: string }).value)}
            minlength={8}
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
            <span>Password updated.</span>
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
