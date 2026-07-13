import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type PatternRewrite } from "../api/client";
import { ListSkeleton } from "../components/ListSkeleton";

export function PatternRewritesPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [rewrites, setRewrites] = useState<PatternRewrite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!domainId) return;
    setRewrites(await api.listPatternRewrites(domainId));
  }, [domainId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const remove = async (ruleId: string) => {
    if (!domainId) return;
    setError(null);
    try {
      await api.deletePatternRewrite(domainId, ruleId);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove pattern rewrite");
    }
  };

  if (!domainId) return null;

  return (
    <div>
      <div className="page-header">
        <h1>Pattern Rewrites</h1>
        <div className="page-header-actions">
          <Link to={`/domains/${domainId}/rewrites/new`} className="dashboard-cta">
            New Pattern Rewrite
          </Link>
        </div>
      </div>
      <p className="introduction">
        Redirect mail matching a wildcard pattern to an existing mailbox instead of bouncing. Only takes effect on
        mail that would otherwise hit this domain's catch-all recipient - set one under Catchall Recipients first.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="material-card">
        {rewrites === null ? (
          <ListSkeleton />
        ) : rewrites.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">@</span>
            <p>No pattern rewrites yet.</p>
            <Link to={`/domains/${domainId}/rewrites/new`} className="dashboard-cta">
              Add your first pattern rewrite
            </Link>
          </div>
        ) : (
          <md-list>
            {rewrites.map((rw) => (
              <md-list-item key={rw.id} type="text">
                <div slot="headline">{rw.pattern}</div>
                <div slot="supporting-text">Redirects to {rw.destination}</div>
                <div slot="end">
                  <button type="button" className="button-pill-outline button-pill-danger" onClick={() => remove(rw.id)}>
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
