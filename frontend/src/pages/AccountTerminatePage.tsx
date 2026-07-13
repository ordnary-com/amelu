import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";

export function AccountTerminatePage() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startConfirm = (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword) return;
    setConfirming(true);
  };

  const terminate = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.terminateAccount(currentPassword);
      await logout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not terminate account");
      setConfirming(false);
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Terminate Account</h1>
      <p>
        This permanently deletes your account and organization, including every domain and mailbox under it,
        from the mail cluster. This cannot be undone.
      </p>

      <form onSubmit={startConfirm}>
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

        <div className="field-action">
          <md-filled-button type="submit" className="md-button-error">
            Terminate account
          </md-filled-button>
        </div>
      </form>

      <md-dialog open={confirming} onClose={() => setConfirming(false)}>
        <div slot="headline">Permanently terminate your account?</div>
        <div slot="content">
          This immediately and permanently deletes your account and organization, including every domain and
          mailbox under it. There is no way to recover this data afterwards.
        </div>
        <div slot="actions">
          <md-text-button type="button" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </md-text-button>
          <md-filled-button type="button" className="md-button-error" onClick={terminate} disabled={busy}>
            Yes, permanently terminate my account
          </md-filled-button>
        </div>
      </md-dialog>
    </div>
  );
}
