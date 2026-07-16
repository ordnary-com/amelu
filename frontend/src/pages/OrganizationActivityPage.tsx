import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AuditEntry } from "../api/client";
import { ListSkeleton } from "../components/ListSkeleton";

function describe(entry: AuditEntry): string {
  const label = entry.objectLabel ? ` ${entry.objectLabel}` : "";
  return `${entry.action.replace(/_/g, " ").replace(/\./g, " · ")}${label}`;
}

export function OrganizationActivityPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await api.listOrganizationAudit());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load activity");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (!entries || entries.length === 0) return;
    setLoadingMore(true);
    try {
      const next = await api.listOrganizationAudit(entries[entries.length - 1].createdAt);
      if (next.length === 0) setExhausted(true);
      setEntries([...entries, ...next]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load more activity");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <h1>Organization Activity</h1>
      <p className="introduction">
        Recent team, invitation, domain, mailbox, and billing changes across your organization. What you can see
        here depends on your role.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="material-card">
        {entries === null ? (
          <ListSkeleton />
        ) : entries.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">@</span>
            <p>No activity yet.</p>
          </div>
        ) : (
          <md-list>
            {entries.map((e) => (
              <md-list-item key={e.id} type="text">
                <div slot="headline">{describe(e)}</div>
                <div slot="supporting-text">
                  {e.actorEmail} · {e.createdAt}
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>

      {entries && entries.length > 0 && !exhausted && (
        <div className="field-action">
          <md-outlined-button type="button" onClick={loadMore} disabled={loadingMore}>
            Load more
          </md-outlined-button>
        </div>
      )}
    </div>
  );
}
