import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function NewPatternRewritePage() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();
  const [pattern, setPattern] = useState("");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createPatternRewrite(domainId, pattern.trim(), destination.trim());
      navigate(`/domains/${domainId}/rewrites`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create pattern rewrite");
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>New Rewrite</h1>
      <p>
        Mail sent to an address matching the pattern below is redirected to an existing mailbox instead of
        bouncing. Use <code>*</code> to match any run of characters, e.g. <code>sales-*@yourdomain.tld</code>.
      </p>
      <p>This only takes effect on mail that would otherwise hit this domain's catch-all recipient.</p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Pattern"
            placeholder="eg. sales-*@yourdomain.tld"
            value={pattern}
            onInput={(e) => setPattern((e.target as unknown as { value: string }).value)}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <md-outlined-text-field
            label="Redirect to mailbox"
            placeholder="eg. sales"
            value={destination}
            onInput={(e) => setDestination((e.target as unknown as { value: string }).value)}
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
            Create Rewrite
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
