import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, API_URL, type Mailbox } from "../api/client";
import { Tag } from "../components/Tag";

function formatDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function MailboxesPage() {
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

  const remove = async (id: string) => {
    await api.deleteMailbox(id);
    await reload();
  };

  const filtered = useMemo(() => {
    if (!mailboxes) return null;
    const q = query.trim().toLowerCase();
    if (!q) return mailboxes;
    return mailboxes.filter((m) => m.address.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q));
  }, [mailboxes, query]);

  if (!domainId) return null;

  return (
    <div>
      <div className="page-header">
        <h1>All Mailboxes</h1>
        <div className="page-header-actions">
          <input
            className="search-field"
            type="text"
            placeholder="Filter mailboxes…"
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
        ) : mailboxes && mailboxes.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">@</span>
            <p>You haven't added any mailboxes on this domain yet.</p>
            <Link to={`/domains/${domainId}/mailboxes/new`} className="dashboard-cta">
              Add your first mailbox
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="material-empty-state">
            <span className="material-empty-icon">@</span>
            <p>No mailboxes match "{query}".</p>
            <button type="button" className="button-pill-outline" onClick={() => setQuery("")}>
              Clear filter
            </button>
          </div>
        ) : (
          <md-list>
            {filtered.map((m) => (
              <md-list-item key={m.id} type="text">
                <div slot="headline">
                  <Link to={`/domains/${domainId}/mailboxes/${m.id}`} className="material-table-title">
                    {m.address}
                  </Link>
                </div>
                <div slot="supporting-text">
                  {m.displayName || "No display name"} · Added {formatDate(m.createdAt)}
                </div>
                <div slot="end" className="mailbox-item-end">
                  <Tag status={m.status} />
                  <Link to={`/domains/${domainId}/mailboxes/${m.id}`} className="button-pill-outline">
                    Manage
                  </Link>
                  <button type="button" className="button-pill-outline button-pill-danger" onClick={() => remove(m.id)}>
                    Delete
                  </button>
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>

      <p className="light" style={{ marginTop: "1rem" }}>
        <a href={`${API_URL}/api/domains/${domainId}/mailboxes/export`}>Export to CSV</a>
      </p>
    </div>
  );
}
