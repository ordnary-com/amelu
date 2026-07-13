import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function NewDomainAliasPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createDomainAlias(domainId, name.trim());
      navigate(`/domains/${domainId}/domain-aliases`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add domain alias");
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>New Domain Alias</h1>
      <p>
        Mail sent to any address at the alias domain will be delivered as if it were sent to the same address at
        this domain. You still need to point the alias domain's own MX records at the same mail cluster.
      </p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Alias domain"
            placeholder="eg. example.org"
            value={name}
            onInput={(e) => setName((e.target as unknown as { value: string }).value)}
            required
            autoFocus
          />
        </div>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        <div className="field-action">
          <md-filled-button type="submit" disabled={busy}>
            Create Domain Alias
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
