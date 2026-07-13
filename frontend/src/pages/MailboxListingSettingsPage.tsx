import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function MailboxListingSettingsPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mailboxId) return;
    api.getMailboxListing(mailboxId).then((l) => {
      setName(l.name);
      setTags(l.tags);
      setLoaded(true);
    });
  }, [mailboxId]);

  if (!mailboxId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const r = await api.updateMailboxListing(mailboxId, { name, tags });
      setName(r.name);
      setTags(r.tags);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save listing settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Listing Settings</h1>
      <p>
        Enhance the mailboxes listing with short descriptions. Logically similar mailboxes may be grouped
        together by using the same tags, for example hr, sales etc.
      </p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Name"
            disabled={!loaded}
            value={name}
            onInput={(e) => setName((e.target as unknown as { value: string }).value)}
          />
        </div>

        <div className="field">
          <md-outlined-text-field
            label="Comma-separated tags"
            placeholder="e.g. group1, group2..."
            disabled={!loaded}
            value={tags}
            onInput={(e) => setTags((e.target as unknown as { value: string }).value)}
            supportingText="Comma separated tags will automatically group your mailboxes in the listing and provide you with shortcuts for them."
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
