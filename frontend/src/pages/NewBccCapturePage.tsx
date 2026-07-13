import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function NewBccCapturePage() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();
  const [pattern, setPattern] = useState("");
  const [capture, setCapture] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createBccCapture(domainId, pattern.trim(), capture.trim());
      navigate(`/domains/${domainId}/bccs`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create bcc capture");
      setBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>New Capture</h1>
      <p>
        A copy of every message matching the pattern below is silently delivered to the capture address, without
        affecting normal delivery of the original. Use <code>*</code> to match any run of characters, e.g.{" "}
        <code>*@yourdomain.tld</code> to capture everything.
      </p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Pattern"
            placeholder="eg. *@yourdomain.tld"
            value={pattern}
            onInput={(e) => setPattern((e.target as unknown as { value: string }).value)}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <md-outlined-text-field
            label="Copy to"
            type="email"
            placeholder="eg. archive@example.com"
            value={capture}
            onInput={(e) => setCapture((e.target as unknown as { value: string }).value)}
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
            Create Capture
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
