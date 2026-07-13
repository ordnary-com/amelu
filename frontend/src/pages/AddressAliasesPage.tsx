import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type AddressAlias } from "../api/client";
import { ListSkeleton } from "../components/ListSkeleton";

export function AddressAliasesPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [aliases, setAliases] = useState<AddressAlias[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!domainId) return;
    setAliases(await api.listAddressAliases(domainId));
  }, [domainId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const remove = async (a: AddressAlias) => {
    setError(null);
    try {
      await api.deleteAddressAlias(a.destinationMailboxId, a.index);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove alias");
    }
  };

  if (!domainId) return null;

  return (
    <div>
      <div className="page-header">
        <h1>Address Aliases</h1>
        <div className="page-header-actions">
          <Link to={`/domains/${domainId}/aliases/new`} className="dashboard-cta">
            New Alias
          </Link>
        </div>
      </div>
      <p className="introduction">
        Aliases redirect incoming messages to an existing mailbox and can coexist with mailboxes of the same
        address.
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
            <p>No address aliases yet.</p>
            <Link to={`/domains/${domainId}/aliases/new`} className="dashboard-cta">
              Add your first alias
            </Link>
          </div>
        ) : (
          <md-list>
            {aliases.map((a) => (
              <md-list-item key={`${a.destinationMailboxId}-${a.index}`} type="text">
                <div slot="headline">{a.address}</div>
                <div slot="supporting-text">
                  Delivers to{" "}
                  <Link to={`/domains/${domainId}/mailboxes/${a.destinationMailboxId}`}>
                    {a.destinationMailbox}
                  </Link>
                </div>
                <div slot="end">
                  <button type="button" className="button-pill-outline button-pill-danger" onClick={() => remove(a)}>
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
