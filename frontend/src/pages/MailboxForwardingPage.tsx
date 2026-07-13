import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type MailboxForward } from "../api/client";
import { useParams } from "react-router-dom";
import { ListSkeleton } from "../components/ListSkeleton";

export function MailboxForwardingPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const [forwards, setForwards] = useState<MailboxForward[] | null>(null);
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!mailboxId) return;
    setForwards(await api.listMailboxForwards(mailboxId));
  }, [mailboxId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!mailboxId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createMailboxForward(mailboxId, destination.trim());
      setDestination("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create forward");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (forwardId: string) => {
    setError(null);
    try {
      await api.deleteMailboxForward(mailboxId, forwardId);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove forward");
    }
  };

  return (
    <div>
      <h1>Forwarding</h1>
      <p>
        Forwarding sends a copy of incoming messages of this mailbox to an address on another domain. To forward
        to an address on this same domain, use aliases or delegation instead.
      </p>
      <div className="alert alert-warning">
        <span>
          <b>Important:</b> If an incoming message is considered spam by our filter, it will not be forwarded
          further - a copy is placed in the Junk folder of this mailbox instead.
        </span>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="material-card">
        {forwards === null ? (
          <ListSkeleton rows={2} />
        ) : forwards.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">@</span>
            <p>Not forwarding yet.</p>
          </div>
        ) : (
          <md-list>
            {forwards.map((f) => (
              <md-list-item key={f.id} type="text">
                <div slot="headline">{f.destination}</div>
                <div slot="end">
                  <button type="button" className="button-pill-outline button-pill-danger" onClick={() => remove(f.id)}>
                    Delete
                  </button>
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>

      <div className="settings-form">
        <h4>New Forwarding</h4>
        <form onSubmit={submit}>
          <div className="field">
            <md-outlined-text-field
              label="Destination address"
              type="email"
              placeholder="eg. someone@example.com"
              value={destination}
              onInput={(e) => setDestination((e.target as unknown as { value: string }).value)}
              required
            />
          </div>

          <div className="field-action">
            <md-filled-button type="submit" disabled={busy}>
              New Forwarding
            </md-filled-button>
          </div>
        </form>
      </div>
    </div>
  );
}
