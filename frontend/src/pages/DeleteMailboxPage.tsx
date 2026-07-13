import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function DeleteMailboxPage() {
  const { domainId, mailboxId } = useParams<{ domainId: string; mailboxId: string }>();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!domainId || !mailboxId) return null;

  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.deleteMailbox(mailboxId);
      navigate(`/domains/${domainId}/mailboxes`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete mailbox");
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Delete Mailbox</h1>
      <p>This permanently removes the mailbox from the mail cluster. This cannot be undone.</p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="field-action">
        <md-filled-button type="button" className="md-button-error" onClick={() => setConfirming(true)}>
          Delete this mailbox
        </md-filled-button>
      </div>

      <md-dialog open={confirming} onClose={() => setConfirming(false)}>
        <div slot="headline">Permanently delete this mailbox?</div>
        <div slot="content">
          This immediately and permanently erases the mailbox along with its messages, aliases, and settings.
          There is no way to recover this data afterwards.
        </div>
        <div slot="actions">
          <md-text-button type="button" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </md-text-button>
          <md-filled-button type="button" className="md-button-error" onClick={remove} disabled={busy}>
            Yes, permanently delete
          </md-filled-button>
        </div>
      </md-dialog>
    </div>
  );
}
