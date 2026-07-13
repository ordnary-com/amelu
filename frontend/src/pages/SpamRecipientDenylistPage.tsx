import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function SpamRecipientDenylistPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [denylist, setDenylist] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domainId) return;
    api.getSpamRecipientDenylist(domainId).then((d) => {
      setDenylist(d.denylist);
      setLoaded(true);
    });
  }, [domainId]);

  if (!domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.updateSpamRecipientDenylist(domainId, { denylist });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save recipient denylist");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form settings-form-wide">
      <h1>Recipient Denylist</h1>

      <p>
        Any message with a recipient address that matches an entry in this denylist is silently dropped. Use this
        denylist to block messages sent to specific addresses on your domain. An entry in this list is a hard
        block, without a possibility to reach your Junk folder.
      </p>
      <p>Unlike with the sender lists, you cannot use wildcards here but have to specify complete, specific addresses.</p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Recipients (complete addresses)"
            type="textarea"
            rows={8}
            placeholder="List full addresses to block"
            disabled={!loaded}
            value={denylist}
            onInput={(e) => setDenylist((e.target as unknown as { value: string }).value)}
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
