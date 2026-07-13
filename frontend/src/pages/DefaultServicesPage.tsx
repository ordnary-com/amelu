import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, type EnabledServices } from "../api/client";

const DEFAULT_SERVICES: EnabledServices = {
  maySend: false,
  mayReceive: false,
  mayImap: false,
  mayPop3: false,
  maySieve: false,
};

export function DefaultServicesPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [services, setServices] = useState<EnabledServices>(DEFAULT_SERVICES);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domainId) return;
    api.getDomainDefaultServices(domainId).then((s) => {
      setServices(s);
      setLoaded(true);
    });
  }, [domainId]);

  if (!domainId) return null;

  const set = (patch: Partial<EnabledServices>) => setServices((s) => ({ ...s, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!services) return;
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      setServices(await api.updateDomainDefaultServices(domainId, services));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save default services");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Default Mailbox Services</h1>
      <p>
        Once a new mailbox is provisioned, a default set of services will be activated based on this setting.
        This setting has no effect on existing mailboxes on this domain.
      </p>
      <p>We recommend keeping the enabled services to the necessary minimum in order to reduce attack surface.</p>

      <form onSubmit={submit}>
        <h4>Enabled Services</h4>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={services.maySend}
              onChange={(e) => set({ maySend: (e.target as unknown as { checked: boolean }).checked })}
            />
            May send
          </label>
        </p>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={services.mayReceive}
              onChange={(e) => set({ mayReceive: (e.target as unknown as { checked: boolean }).checked })}
            />
            May receive
          </label>
        </p>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={services.mayImap}
              onChange={(e) => set({ mayImap: (e.target as unknown as { checked: boolean }).checked })}
            />
            May access over IMAP
          </label>
        </p>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={services.mayPop3}
              onChange={(e) => set({ mayPop3: (e.target as unknown as { checked: boolean }).checked })}
            />
            May access over POP3
          </label>
        </p>

        <h4>Sieve Filtering</h4>
        <p>
          Sieve is a programming language that can be used for email filtering. When enabled, custom scripts may
          be managed using the ManageSieve protocol.
        </p>
        <p className="md-radio-row">
          <label className="md-radio-label">
            <md-checkbox
              disabled={!loaded}
              checked={services.maySieve}
              onChange={(e) => set({ maySieve: (e.target as unknown as { checked: boolean }).checked })}
            />
            May access ManageSieve
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
