import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Domain } from "../api/client";

// Unlike Migadu, Stalwart enforces alias addresses as globally unique per
// domain - one alias can only ever deliver to a single mailbox here, so
// this takes one destination rather than a list.
export function NewAliasPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [localPart, setLocalPart] = useState("");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domainId) return;
    api.listDomains().then((domains) => setDomain(domains.find((d) => d.id === domainId) ?? null));
  }, [domainId]);

  if (!domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { results } = await api.createAddressAlias(domainId, localPart.trim(), destination.trim());
      const failure = results.find((r) => r.error);
      if (failure) {
        setError(failure.error!);
        setBusy(false);
        return;
      }
      navigate(`/domains/${domainId}/aliases`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create alias");
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>New Address Alias</h1>
      <p>
        Aliases redirect incoming messages to an existing mailbox and can coexist with mailboxes with the same
        address.
      </p>
      <p>
        Only the local part is required for both fields. Everything after the @ sign is automatically removed, as
        aliasing to other domains is not possible.
      </p>

      <form onSubmit={submit}>
        <h4>Alias Setup</h4>
        <div className="field">
          <md-outlined-text-field
            label="Original addressee"
            placeholder="eg. nickname"
            value={localPart}
            onInput={(e) => setLocalPart((e.target as unknown as { value: string }).value)}
            suffixText={`@${domain?.name ?? ""}`}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <md-outlined-text-field
            label="Deliver to"
            placeholder="eg. mailbox"
            value={destination}
            onInput={(e) => setDestination((e.target as unknown as { value: string }).value)}
            suffixText={`@${domain?.name ?? ""}`}
            required
          />
        </div>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        <div className="field-action">
          <md-filled-button type="submit" disabled={busy}>
            Create Alias
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
