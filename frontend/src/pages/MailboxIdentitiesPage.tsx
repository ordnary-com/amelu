import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, type Identity } from "../api/client";
import { ListSkeleton } from "../components/ListSkeleton";

export function MailboxIdentitiesPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!mailboxId) return;
    setIdentities(await api.listMailboxIdentities(mailboxId));
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
      await api.createMailboxIdentity(mailboxId, name.trim(), email.trim());
      setName("");
      setEmail("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create identity");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (identityId: string) => {
    setError(null);
    try {
      await api.deleteMailboxIdentity(mailboxId, identityId);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove identity");
    }
  };

  return (
    <div>
      <h1>Identities</h1>
      <p>Identities serve as alternative addresses you can use to represent yourself when sending and receiving.</p>
      <p className="light">
        The address must be one this mailbox already owns - either its own address or an existing alias of it.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="material-card">
        {identities === null ? (
          <ListSkeleton />
        ) : identities.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">@</span>
            <p>No identities yet.</p>
          </div>
        ) : (
          <md-list>
            {identities.map((id) => (
              <md-list-item key={id.id} type="text">
                <div slot="headline">{id.name || <span className="light">No name</span>}</div>
                <div slot="supporting-text">{id.email}</div>
                <div slot="end">
                  <button type="button" className="button-pill-outline button-pill-danger" onClick={() => remove(id.id)}>
                    Delete
                  </button>
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>

      <div className="settings-form">
        <h4>New Identity</h4>
        <form onSubmit={submit}>
          <div className="field">
            <md-outlined-text-field label="Name" value={name} onInput={(e) => setName((e.target as unknown as { value: string }).value)} />
          </div>
          <div className="field">
            <md-outlined-text-field
              label="Address"
              type="email"
              placeholder="eg. support@yourdomain.tld"
              value={email}
              onInput={(e) => setEmail((e.target as unknown as { value: string }).value)}
              required
            />
          </div>

          <div className="field-action">
            <md-filled-button type="submit" disabled={busy}>
              New Identity
            </md-filled-button>
          </div>
        </form>
      </div>
    </div>
  );
}
