import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type BccCapture } from "../api/client";
import { ListSkeleton } from "../components/ListSkeleton";

export function BccCapturesPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [captures, setCaptures] = useState<BccCapture[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!domainId) return;
    setCaptures(await api.listBccCaptures(domainId));
  }, [domainId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const remove = async (ruleId: string) => {
    if (!domainId) return;
    setError(null);
    try {
      await api.deleteBccCapture(domainId, ruleId);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove bcc capture");
    }
  };

  if (!domainId) return null;

  return (
    <div>
      <div className="page-header">
        <h1>Bcc. Captures</h1>
        <div className="page-header-actions">
          <Link to={`/domains/${domainId}/bccs/new`} className="dashboard-cta">
            New Bcc. Capture
          </Link>
        </div>
      </div>
      <p className="introduction">
        Silently deliver a copy of mail matching a wildcard pattern to another address, without affecting normal
        delivery. Applies to mail delivered to any mailbox on this domain.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="material-card">
        {captures === null ? (
          <ListSkeleton />
        ) : captures.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">@</span>
            <p>No bcc captures yet.</p>
            <Link to={`/domains/${domainId}/bccs/new`} className="dashboard-cta">
              Add your first bcc capture
            </Link>
          </div>
        ) : (
          <md-list>
            {captures.map((c) => (
              <md-list-item key={c.id} type="text">
                <div slot="headline">{c.pattern}</div>
                <div slot="supporting-text">Copy to {c.capture}</div>
                <div slot="end">
                  <button type="button" className="button-pill-outline button-pill-danger" onClick={() => remove(c.id)}>
                    Delete
                  </button>
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>
    </div>
  );
}
