import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type ImportMailboxResult } from "../api/client";

export function ImportMailboxesPage() {
  const navigate = useNavigate();
  const { domainId } = useParams<{ domainId: string }>();
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportMailboxResult[] | null>(null);

  if (!domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { results } = await api.importMailboxesCSV(domainId, csv);
      setResults(results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import mailboxes");
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
              <th>Address</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.address}>
                <td>{r.address}</td>
                <td>
                  {r.error ? (
                    <span className="red">{r.error}</span>
                  ) : (
                    <>
                      Created.{" "}
                      {r.generatedPassword && (
                        <>
                          Password: <span className="api-token">{r.generatedPassword}</span>{" "}
                        </>
                      )}
                      {r.note && <span className="light">{r.note}</span>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="field-action">
          <md-filled-button onClick={() => navigate(`/domains/${domainId}/mailboxes`)}>
            Return to all mailboxes
          </md-filled-button>
        </div>
      </div>
    );
  }

  return (
    <div className="import-form">
      <h1>Import New Mailboxes from CSV</h1>
      <p>
        Use this form to bulk import mailboxes from comma separated values (CSV) data. The input data must be in
        the acceptable format. Only up to 100 non-existing mailboxes may be imported.
      </p>

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
            Import Mailboxes
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
