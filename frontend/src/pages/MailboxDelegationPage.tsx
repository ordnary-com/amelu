import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, type Mailbox } from "../api/client";

export function MailboxDelegationPage() {
  const { mailboxId, domainId } = useParams<{ mailboxId: string; domainId: string }>();
  const [delegation, setDelegation] = useState("");
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mailboxId) return;
    Promise.all([api.getMailboxDelegation(mailboxId), api.getMailbox(mailboxId)]).then(([d, m]) => {
      setDelegation(d.delegation);
      setMailbox(m);
      setLoaded(true);
    });
  }, [mailboxId]);

  if (!mailboxId || !domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const r = await api.updateMailboxDelegation(mailboxId, delegation);
      setDelegation(r.delegation);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save delegation");
    } finally {
      setBusy(false);
    }
  };

  const domainName = mailbox?.address.split("@")[1] ?? "";

  return (
    <div className="settings-form settings-form-wide">
      <h1>Delegations</h1>
      <p>
        Delegations reassign incoming mail destined for this mailbox to other mailboxes on the same domain,
        instead of also keeping a copy here.
      </p>
      <p>
        List all desired recipients on your domain below, one per line. Only the local part is required -
        everything after the @ sign is automatically replaced with your domain, as delegating to other domains
        isn't possible.
      </p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label={`Local recipients ${domainName ? `(@${domainName})` : ""}`}
            type="textarea"
            rows={8}
            disabled={!loaded}
            value={delegation}
            onInput={(e) => setDelegation((e.target as unknown as { value: string }).value)}
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
          <md-filled-button type="submit" disabled={busy || !loaded}>
            Save Changes
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
