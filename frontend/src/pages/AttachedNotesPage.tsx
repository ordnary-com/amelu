import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function AttachedNotesPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domainId) return;
    api.listDomains().then((domains) => {
      setNotes(domains.find((d) => d.id === domainId)?.notes ?? "");
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
      await api.updateDomainNotes(domainId, notes);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save notes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form settings-form-wide">
      <h1>Attached Notes</h1>
      <p className="introduction">Free-form notes about this domain, visible only to you.</p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Notes"
            type="textarea"
            rows={8}
            disabled={!loaded}
            value={notes}
            onInput={(e) => setNotes((e.target as unknown as { value: string }).value)}
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
