import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Mailbox } from "../api/client";
import { Tag } from "../components/Tag";

export function AllAddressesPage() {
  const navigate = useNavigate();
  const { domainId } = useParams<{ domainId: string }>();
  const [mailboxes, setMailboxes] = useState<Mailbox[] | null>(null);
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    if (!domainId) return;
    setMailboxes(await api.listMailboxes(domainId));
  }, [domainId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    if (!mailboxes) return null;
    const q = query.trim().toLowerCase();
    if (!q) return mailboxes;
    return mailboxes.filter((m) => m.address.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q));
  }, [mailboxes, query]);

  if (!domainId) return null;

  const goToMailbox = (e: React.MouseEvent, mailboxId: string) => {
    e.preventDefault();
    navigate(`/domains/${domainId}/mailboxes/${mailboxId}`);
  };

  return (
    <div>
      <div className="page-header">
        <h1>All Addresses</h1>
        <div className="page-header-actions">
          <input
            className="search-field"
            type="text"
            placeholder="Filter addresses…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Link to={`/domains/${domainId}/mailboxes/new`} className="dashboard-cta">
            New Mailbox
          </Link>
        </div>
      </div>

      <div className="material-card">
        {filtered === null ? (
          <p className="light">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">@</span>
            {mailboxes && mailboxes.length > 0 ? (
              <>
                <p>No addresses match "{query}".</p>
                <button type="button" className="button-pill-outline" onClick={() => setQuery("")}>
                  Clear filter
                </button>
              </>
            ) : (
              <>
                <p>You haven't added any mailboxes on this domain yet.</p>
                <Link to={`/domains/${domainId}/mailboxes/new`} className="dashboard-cta">
                  Add your first mailbox
                </Link>
              </>
            )}
          </div>
        ) : (
          <md-list>
            {filtered.map((m) => (
              <md-list-item
                key={m.id}
                type="link"
                href={`/domains/${domainId}/mailboxes/${m.id}`}
                onClick={(e: React.MouseEvent) => goToMailbox(e, m.id)}
              >
                <div slot="headline">
                  {m.displayName && <b>{m.displayName} </b>}
                  {m.address}
                </div>
                <div slot="supporting-text">Mailbox</div>
                <div slot="end">
                  <Tag status={m.status} />
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>
    </div>
  );
}
