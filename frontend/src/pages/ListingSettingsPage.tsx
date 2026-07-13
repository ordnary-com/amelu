import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, type Domain } from "../api/client";

export function ListingSettingsPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [publiclyListed, setPubliclyListed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domainId) return;
    api.listDomains().then((domains) => {
      const d = domains.find((x) => x.id === domainId) ?? null;
      setDomain(d);
      setPubliclyListed(d?.publiclyListed ?? false);
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
      await api.updateDomainListing(domainId, publiclyListed);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update listing setting");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Listing Settings</h1>
      <p className="introduction">Control whether this domain appears in any public directory of Amelu domains.</p>

      <form onSubmit={submit}>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={publiclyListed}
              onChange={(e) => setPubliclyListed((e.target as unknown as { checked: boolean }).checked)}
            />
            List this domain publicly
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
            Save
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
