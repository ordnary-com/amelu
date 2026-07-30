import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type ApiKey } from "../api/client";
import { ListSkeleton } from "../components/ListSkeleton";
import { useSnackbar } from "../context/SnackbarContext";

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleString();
}

export function AccountApiKeysPage() {
  const { showSnackbar } = useSnackbar();

  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setKeys(await api.listApiKeys());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load API keys");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNewKey(null);
    setCreating(true);
    try {
      const created = await api.createApiKey(name.trim());
      setNewKey(created.key);
      setName("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create API key");
    } finally {
      setCreating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setError(null);
    try {
      await api.revokeApiKey(revokeTarget.id);
      setRevokeTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revoke API key");
    } finally {
      setRevoking(false);
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    showSnackbar("API key copied to clipboard.");
  };

  return (
    <div className="settings-form">
      <h1>API Keys</h1>

      <p>
        An API key lets a script or service call the Amelu API as you, with the same permissions your account has.
        Send it as a bearer token: <code>Authorization: Bearer amelu_live_...</code>
      </p>
      <p className="light">
        Keys cannot manage your account or create other keys. Those still need a signed-in browser session. Treat a
        key like a password: anything holding it can manage your domains and mailboxes.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {newKey && (
        <div className="alert alert-warning">
          <span>
            <b>Copy this key now.</b> It is not stored and cannot be shown again.
            <br />
            <code>{newKey}</code>
            <br />
            <button type="button" className="button-pill-outline" onClick={copyKey}>
              Copy
            </button>
          </span>
        </div>
      )}

      <div className="material-card">
        {keys === null ? (
          <ListSkeleton />
        ) : keys.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">#</span>
            <p>No API keys yet.</p>
          </div>
        ) : (
          <md-list>
            {keys.map((k) => (
              <md-list-item key={k.id} type="text">
                <div slot="headline">{k.name}</div>
                <div slot="supporting-text">
                  {k.prefix}… · created {formatDate(k.createdAt)}
                  {k.lastUsedAt ? ` · last used ${formatDate(k.lastUsedAt)}` : " · never used"}
                </div>
                <div slot="end">
                  <button
                    type="button"
                    className="button-pill-outline button-pill-danger"
                    onClick={() => setRevokeTarget(k)}
                  >
                    Revoke
                  </button>
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>

      <h4>Create a Key</h4>
      <form onSubmit={create}>
        <div className="field">
          <md-outlined-text-field
            label="Name"
            placeholder="eg. provisioning script"
            value={name}
            onInput={(e) => setName((e.target as unknown as { value: string }).value)}
            required
          />
        </div>
        <div className="field-action">
          <md-filled-button type="submit" disabled={creating}>
            Create Key
          </md-filled-button>
        </div>
      </form>

      <md-dialog open={!!revokeTarget}>
        <div slot="headline">Revoke {revokeTarget?.name}?</div>
        <div slot="content">
          Anything still using this key stops working immediately. This cannot be undone, so a replacement has to be
          a new key.
        </div>
        <div slot="actions">
          <md-text-button type="button" onClick={() => setRevokeTarget(null)} disabled={revoking}>
            Cancel
          </md-text-button>
          <md-filled-button type="button" className="md-button-error" onClick={confirmRevoke} disabled={revoking}>
            Yes, revoke it
          </md-filled-button>
        </div>
      </md-dialog>
    </div>
  );
}
