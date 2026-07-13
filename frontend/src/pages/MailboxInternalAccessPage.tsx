import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function MailboxInternalAccessPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const [internalAccessOnly, setInternalAccessOnly] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mailboxId) return;
    api.getMailboxInternalAccess(mailboxId).then((r) => {
      setInternalAccessOnly(r.internalAccessOnly);
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
      const r = await api.updateMailboxInternalAccess(mailboxId, internalAccessOnly);
      setInternalAccessOnly(r.internalAccessOnly);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update setting");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Private Internal Mailbox</h1>
      <p>
        A mailbox can be restricted to receive messages only from other mailboxes on this domain. No external
        message would be accepted.
      </p>
      <p>Use this feature to set up an internal, private mailbox. Use the domain's denylists and junklists for even finer control.</p>

      <form onSubmit={submit}>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={internalAccessOnly}
              onChange={(e) => setInternalAccessOnly((e.target as unknown as { checked: boolean }).checked)}
            />
            Internal access only
          </label>
        </p>

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
