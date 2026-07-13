import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function SpamAggressivenessPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [subjectRewrite, setSubjectRewrite] = useState(false);
  const [junkIfSubjectSpam, setJunkIfSubjectSpam] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domainId) return;
    api.getSpamSubjectSettings(domainId).then((s) => {
      setSubjectRewrite(s.subjectRewrite);
      setJunkIfSubjectSpam(s.junkIfSubjectSpam);
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
      await api.updateSpamSubjectSettings(domainId, { subjectRewrite, junkIfSubjectSpam });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Spam Filter Aggressiveness</h1>

      <p>
        Upon receiving, each message gets scored across many different tests and parameters. Once a final score is
        concluded, an action is taken based on it.
      </p>
      <p className="light">
        Detection sensitivity itself isn't adjustable per domain - it's shared infrastructure across every domain on
        this mail cluster, and changing it would affect other customers. The two controls below apply only to your
        own domain.
      </p>

      <form onSubmit={submit}>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={subjectRewrite}
              onChange={(e) => setSubjectRewrite((e.target as unknown as { checked: boolean }).checked)}
            />
            Prefix subject line of junk messages with "SPAM"
          </label>
        </p>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={junkIfSubjectSpam}
              onChange={(e) => setJunkIfSubjectSpam((e.target as unknown as { checked: boolean }).checked)}
            />
            Junk messages with word "SPAM" in subject (case insensitive)
          </label>
        </p>

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
