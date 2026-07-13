import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type DomainAlias } from "../api/client";
import { ListSkeleton } from "../components/ListSkeleton";

export function DomainAliasesPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [aliases, setAliases] = useState<DomainAlias[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!domainId) return;
    setAliases(await api.listDomainAliases(domainId));
  }, [domainId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const remove = async (name: string) => {
    if (!domainId) return;
    setError(null);
    try {
      await api.deleteDomainAlias(domainId, name);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove domain alias");
    }
  };

  if (!domainId) return null;

  return (
    <div>
      <div className="page-header">
        <h1>Domain Aliases</h1>
        <div className="page-header-actions">
          <Link to={`/domains/${domainId}/domain-aliases/new`} className="dashboard-cta">
            New Domain Alias
          </Link>
        </div>
      </div>
      <p className="introduction">
        Other domain names that also route mail to this domain's mailboxes. Add the alias domain's own DNS
        records separately.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="material-card">
        {aliases === null ? (
          <ListSkeleton />
        ) : aliases.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">@</span>
            <p>No domain aliases yet.</p>
            <Link to={`/domains/${domainId}/domain-aliases/new`} className="dashboard-cta">
              Add your first domain alias
            </Link>
          </div>
        ) : (
          <md-list>
            {aliases.map((a) => (
              <md-list-item key={a.name} type="text">
                <div slot="headline">{a.name}</div>
                <div slot="end">
                  <button type="button" className="button-pill-outline button-pill-danger" onClick={() => remove(a.name)}>
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
