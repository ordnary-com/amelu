import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Domain, type DnsRecordCheck } from "../api/client";
import { Tag } from "../components/Tag";
import { ListSkeleton } from "../components/ListSkeleton";

interface Health {
  mxOk: boolean;
  spfOk: boolean;
  dkimOk: boolean;
}

function deriveHealth(records: DnsRecordCheck[]): Health {
  return {
    mxOk: records.some((r) => r.type === "MX" && r.status === "matched"),
    spfOk: records.some((r) => r.type === "TXT" && r.expected.includes("v=spf1") && r.status === "matched"),
    dkimOk: records.some((r) => r.type === "TXT" && r.name.includes("_domainkey") && r.status === "matched"),
  };
}

function formatDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function DomainsPage() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [health, setHealth] = useState<Record<string, Health>>({});

  const reload = async () => {
    const list = await api.listDomains();
    setDomains(list);

    const entries = await Promise.all(
      list.map(async (d) => {
        try {
          const { records } = await api.getDomainDns(d.id);
          return [d.id, deriveHealth(records)] as const;
        } catch {
          return [d.id, { mxOk: false, spfOk: false, dkimOk: false }] as const;
        }
      }),
    );
    setHealth(Object.fromEntries(entries));
  };

  useEffect(() => {
    reload();
  }, []);

  const goToDomain = (e: React.MouseEvent, domainId: string) => {
    e.preventDefault();
    navigate(`/domains/${domainId}/mailboxes`);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Email Domains</h1>
        <Link to="/domains/new" className="dashboard-cta">
          Add a Domain
        </Link>
      </div>

      <div className="material-card">
        {domains === null ? (
          <ListSkeleton />
        ) : domains.length === 0 ? (
          <div className="material-empty-state">
            <p>You haven't added any email domains yet.</p>
            <Link to="/domains/new" className="dashboard-cta">
              Add your first domain
            </Link>
          </div>
        ) : (
          <md-list>
            {domains.map((d) => {
              const h = health[d.id];
              return (
                <md-list-item
                  key={d.id}
                  type="link"
                  href={`/domains/${d.id}/mailboxes`}
                  onClick={(e: React.MouseEvent) => goToDomain(e, d.id)}
                >
                  <div slot="headline">{d.name}</div>
                  <div slot="end" className="domain-item-end">
                    <Tag status={d.status} />
                    {h && (
                      <div className="health-dots">
                        <span className={`health-dot ${h.mxOk ? "ok" : "fail"}`} title="MX" />
                        <span className={`health-dot ${h.spfOk ? "ok" : "fail"}`} title="SPF" />
                        <span className={`health-dot ${h.dkimOk ? "ok" : "fail"}`} title="DKIM" />
                      </div>
                    )}
                    <span className="light">{formatDate(d.verifiedAt ?? d.createdAt)}</span>
                  </div>
                </md-list-item>
              );
            })}
          </md-list>
        )}
      </div>
    </div>
  );
}
