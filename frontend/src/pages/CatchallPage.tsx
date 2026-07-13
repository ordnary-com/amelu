import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function CatchallPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [address, setAddress] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domainId) return;
    api.getCatchAll(domainId).then((c) => {
      setAddress(c.address ?? "");
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
      await api.updateCatchAll(domainId, address.trim());
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update catch-all recipient");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Catchall Recipients</h1>
      <p>
        Mail sent to any address at this domain that doesn't match an existing mailbox or alias is delivered here
        instead of bouncing. Leave empty to bounce unmatched mail as usual.
      </p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Deliver unmatched mail to"
            placeholder="eg. someone@yourdomain.tld"
            disabled={!loaded}
            value={address}
            onInput={(e) => setAddress((e.target as unknown as { value: string }).value)}
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
            Save
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
