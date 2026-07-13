import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function DeleteDomainPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!domainId) return null;

  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.deleteDomain(domainId);
      navigate("/domains");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete domain");
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Delete Domain</h1>
      <p>
        Deleting a domain permanently erases it and every mailbox, message, alias, and setting under it from the
        mail cluster. This cannot be undone and is not the same as deactivating a domain, which only pauses mail
        delivery while keeping all data intact.
      </p>
      <p>
        Use this when you need to permanently remove a domain's data - for example to fulfil a data subject's
        erasure request under the GDPR, or because the domain is no longer in use.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="field-action">
        <md-filled-button type="button" className="md-button-error" onClick={() => setConfirming(true)}>
          Delete this domain
        </md-filled-button>
      </div>

      <md-dialog open={confirming} onClose={() => setConfirming(false)}>
        <div slot="headline">Permanently delete this domain?</div>
        <div slot="content">
          This immediately and permanently erases the domain along with every mailbox, message, alias, and
          setting under it. There is no way to recover this data afterwards.
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
