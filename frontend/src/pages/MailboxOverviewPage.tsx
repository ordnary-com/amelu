import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, type Mailbox } from "../api/client";
import { Tag } from "../components/Tag";

export function MailboxOverviewPage() {
  const { mailboxId } = useParams<{ domainId: string; mailboxId: string }>();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!mailboxId) return;
    const m = await api.getMailbox(mailboxId);
    setMailbox(m);
    setDisplayName(m.displayName);
  }, [mailboxId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!mailboxId) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      setMailbox(await api.updateMailboxName(mailboxId, displayName.trim()));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update name");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    if (!mailbox) return;
    setMailbox(mailbox.status === "active" ? await api.suspendMailbox(mailboxId) : await api.activateMailbox(mailboxId));
  };

  if (!mailbox) return null;

  const yesNo = (value: boolean) => <span className={value ? "tag green" : "tag"}>{value ? "Yes" : "No"}</span>;

  return (
    <div>
      <h1>Mailbox Overview</h1>

      <div className="material-card">
        <div className="kv-table">
          <div className="kv-row">
            <span className="kv-row-label">Name</span>
            <span>{mailbox.displayName || <span className="light">Not set</span>}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Address</span>
            <span>{mailbox.address}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">State</span>
            <span>
              <Tag status={mailbox.status} />
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Internal access only</span>
            <span>{yesNo(false)}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">May send</span>
            <span>{yesNo(mailbox.status === "active")}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">May receive</span>
            <span>{yesNo(mailbox.status === "active")}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">May access IMAP</span>
            <span>{yesNo(true)}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">May access POP3</span>
            <span>{yesNo(true)}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">May access ManageSieve</span>
            <span>{yesNo(true)}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Forwarding</span>
            <span className="light">Inactive</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Expires</span>
            <span className="light">Never</span>
          </div>
        </div>
      </div>

      <div className="settings-form">
        <h4>Name</h4>
        <form onSubmit={saveName}>
          <div className="field">
            <md-outlined-text-field
              label="Name"
              value={displayName}
              onInput={(e) => setDisplayName((e.target as unknown as { value: string }).value)}
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

        <h4>Access</h4>
        <div className="field-action">
          <md-outlined-button type="button" onClick={toggleStatus}>
            {mailbox.status === "active" ? "Suspend mailbox" : "Activate mailbox"}
          </md-outlined-button>
        </div>
      </div>
    </div>
  );
}
