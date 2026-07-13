import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type Domain } from "../api/client";

export function DeactivateDomainPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!domainId) return;
    const domains = await api.listDomains();
    setDomain(domains.find((d) => d.id === domainId) ?? null);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId]);

  if (!domainId) return null;

  const deactivate = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.deactivateDomain(domainId);
      setConfirming(false);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not deactivate domain");
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.reactivateDomain(domainId);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reactivate domain");
    } finally {
      setBusy(false);
    }
  };

  if (domain?.status === "suspended") {
    return (
      <div className="settings-form">
        <h1>Deactivate Domain</h1>
        <p>
          This domain is currently deactivated. Mail delivery to and from it is suspended, and any message sent
          to it during this time is rejected rather than queued for later delivery.
        </p>
        <p className="light">
          No data has been removed. Every mailbox, message, and setting on this domain has been retained exactly
          as it was and will be available again as soon as you reactivate.
        </p>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        <div className="field-action">
          <md-filled-button type="button" onClick={reactivate} disabled={busy}>
            Reactivate domain
          </md-filled-button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-form">
      <h1>Deactivate Domain</h1>
      <p>
        Deactivating suspends mail delivery to and from this domain immediately. Messages sent to it while
        deactivated are rejected at the mail server, not queued or held for later delivery.
      </p>
      <p>
        This is a reversible operational change, not a data-deletion action: mailboxes, messages, and settings
        are left untouched and become available again the moment you reactivate.
      </p>
      <p className="light">
        To permanently erase this domain's data instead - for example to fulfil a data subject's erasure request
        under the GDPR - use <Link to={`/domains/${domainId}/delete`}>Delete Domain</Link>.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="field-action">
        <md-filled-button type="button" className="md-button-error" onClick={() => setConfirming(true)} disabled={!domain}>
          Deactivate this domain
        </md-filled-button>
      </div>

      <md-dialog open={confirming} onClose={() => setConfirming(false)}>
        <div slot="headline">Deactivate {domain?.name}?</div>
        <div slot="content">
          Mail sent to any address on {domain?.name} will be rejected immediately and this will remain the case
          until the domain is reactivated. No mailboxes, messages, or settings are changed or deleted by this
          action.
        </div>
        <div slot="actions">
          <md-text-button type="button" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </md-text-button>
          <md-filled-button type="button" className="md-button-error" onClick={deactivate} disabled={busy}>
            Yes, deactivate
          </md-filled-button>
        </div>
      </md-dialog>
    </div>
  );
}
