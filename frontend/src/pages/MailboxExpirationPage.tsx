import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function MailboxExpirationPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const [enabled, setEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [removeUponExpiration, setRemoveUponExpiration] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mailboxId) return;
    api.getMailboxExpiration(mailboxId).then((e) => {
      setEnabled(e.expiresAt != null);
      setExpiresAt(e.expiresAt ?? "");
      setRemoveUponExpiration(e.removeUponExpiration);
      setLoaded(true);
    });
  }, [mailboxId]);

  if (!mailboxId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const r = await api.updateMailboxExpiration(mailboxId, {
        expiresAt: enabled ? expiresAt : null,
        removeUponExpiration,
      });
      setEnabled(r.expiresAt != null);
      setExpiresAt(r.expiresAt ?? "");
      setRemoveUponExpiration(r.removeUponExpiration);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save expiration");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Mailbox Expiration</h1>
      <p>
        Mailboxes can expire on a specific future date. Use expirations to make temporary addresses. If you
        choose to remove them upon expiry, their data will be permanently erased - otherwise the mailbox is just
        suspended.
      </p>
      <p className="light">Checked roughly every 15 minutes, not instantly at the exact moment of expiry.</p>

      <form onSubmit={submit}>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={enabled}
              onChange={(e) => setEnabled((e.target as unknown as { checked: boolean }).checked)}
            />
            Expire mailbox on a given date
          </label>
        </p>

        {enabled && (
          <>
            <div className="field">
              <md-outlined-text-field
                label="Expiration date"
                type="date"
                disabled={!loaded}
                value={expiresAt}
                onInput={(e) => setExpiresAt((e.target as unknown as { value: string }).value)}
                required
              />
            </div>
            <p className="md-radio-row">
              <label className="md-radio-label">
                <md-checkbox
                  disabled={!loaded}
                  checked={removeUponExpiration}
                  onChange={(e) => setRemoveUponExpiration((e.target as unknown as { checked: boolean }).checked)}
                />
                Permanently erase this mailbox's data upon expiry (instead of just suspending it)
              </label>
            </p>
          </>
        )}

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
          <md-filled-button type="submit" disabled={busy || !loaded}>
            Save Changes
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
