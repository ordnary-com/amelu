import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

const BYTES_PER_GB = 1024 * 1024 * 1024;

export function DefaultLimitsPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [maxEmails, setMaxEmails] = useState("0");
  const [maxDiskQuotaGB, setMaxDiskQuotaGB] = useState("0");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domainId) return;
    api.getDomainDefaultLimits(domainId).then((l) => {
      setMaxEmails(String(l.maxEmails));
      setMaxDiskQuotaGB(l.maxDiskQuotaBytes === 0 ? "0" : String(l.maxDiskQuotaBytes / BYTES_PER_GB));
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
      const r = await api.updateDomainDefaultLimits(domainId, {
        maxEmails: Math.max(0, Math.round(Number(maxEmails) || 0)),
        maxDiskQuotaBytes: Math.max(0, Math.round((Number(maxDiskQuotaGB) || 0) * BYTES_PER_GB)),
      });
      setMaxEmails(String(r.maxEmails));
      setMaxDiskQuotaGB(r.maxDiskQuotaBytes === 0 ? "0" : String(r.maxDiskQuotaBytes / BYTES_PER_GB));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save default limits");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Default Mailbox Limits</h1>

      <p>Use mailbox limits to prevent abuse and keep costs under control.</p>
      <p>
        Each mailbox created will assume these default limits upon creation. These settings have no effect on
        existing mailboxes. To alter existing mailboxes, visit individual mailbox limits settings.
      </p>
      <p className="light">
        These are total caps enforced by the mail cluster itself (total stored messages, total disk space) - not
        a daily sending/receiving throughput limit. Use 0 for no limit.
      </p>

      <form onSubmit={submit}>
        <h4>Maximum stored messages</h4>
        <div className="field">
          <md-outlined-text-field
            label="Messages"
            type="number"
            min={0}
            step={1}
            disabled={!loaded}
            value={maxEmails}
            onInput={(e) => setMaxEmails((e.target as unknown as { value: string }).value)}
          />
        </div>

        <h4>Maximum disk usage</h4>
        <div className="field">
          <md-outlined-text-field
            label="Gigabytes"
            type="number"
            min={0}
            step={0.1}
            disabled={!loaded}
            value={maxDiskQuotaGB}
            onInput={(e) => setMaxDiskQuotaGB((e.target as unknown as { value: string }).value)}
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
