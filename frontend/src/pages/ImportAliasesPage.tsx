import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type ImportAliasResult } from "../api/client";

export function ImportAliasesPage() {
  const navigate = useNavigate();
  const { domainId } = useParams<{ domainId: string }>();
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportAliasResult[] | null>(null);

  if (!domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { results } = await api.importAddressAliasesCSV(domainId, csv);
      setResults(results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import aliases");
    } finally {
      setBusy(false);
    }
  };

  if (results) {
    return (
      <div className="import-form">
        <h1>Import Results</h1>
        <table>
          <thead>
            <tr>
              <th>Alias</th>
              <th>Destination</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={`${r.alias}-${r.destination}-${i}`}>
                <td>{r.alias}</td>
                <td>{r.destination}</td>
                <td>{r.error ? <span className="red">{r.error}</span> : "Created."}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="field-action">
          <md-filled-button onClick={() => navigate(`/domains/${domainId}/aliases`)}>
            Return to all aliases
          </md-filled-button>
        </div>
      </div>
    );
  }

  return (
    <div className="import-form">
      <h1>Import New Aliases from CSV</h1>
      <p>
        Use this form to bulk import address aliases from comma separated values (CSV) data. Each row is two
        columns and has no header: the alias address, then the destination mailbox it should deliver to. Only the
        local part is required for either column - everything after the @ sign is automatically removed.
      </p>
      <p className="light">Example row: sales,john (delivers sales@yourdomain to john@yourdomain)</p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="CSV data"
            type="textarea"
            rows={20}
            placeholder="Paste your data here..."
            value={csv}
            onInput={(e) => setCsv((e.target as unknown as { value: string }).value)}
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
            Import Aliases
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
