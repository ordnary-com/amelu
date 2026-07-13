import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function TransferOwnershipPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!domainId) return null;

  const startConfirm = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setConfirming(true);
  };

  const transfer = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.transferDomain(domainId, email.trim());
      navigate("/domains");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not transfer domain");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Transfer Ownership</h1>
      <p>
        Transferring this domain moves it, and every mailbox and setting under it, to another Amelu account. You
        will lose access to it immediately.
      </p>

      <form onSubmit={startConfirm}>
        <div className="field">
          <md-outlined-text-field
            label="New owner's email"
            type="email"
            placeholder="eg. someone@example.com"
            value={email}
            onInput={(e) => setEmail((e.target as unknown as { value: string }).value)}
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
            Transfer this domain
          </md-filled-button>
        </div>
      </form>

      <md-dialog open={confirming} onClose={() => setConfirming(false)}>
        <div slot="headline">Transfer this domain?</div>
        <div slot="content">
          This immediately moves the domain, along with every mailbox and setting under it, to{" "}
          <strong>{email.trim()}</strong>. You will lose access to it right away, and this cannot be undone by
          you afterwards.
        </div>
        <div slot="actions">
          <md-text-button type="button" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </md-text-button>
          <md-filled-button type="button" className="md-button-error" onClick={transfer} disabled={busy}>
            Yes, transfer
          </md-filled-button>
        </div>
      </md-dialog>
    </div>
  );
}
