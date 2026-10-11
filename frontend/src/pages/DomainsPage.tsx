import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Domain, type DnsRecordCheck } from "../api/client";
import { Tag } from "../components/Tag";
import { CheckBadge, DomainIcon } from "../components/DashboardIcons";

// null: the DNS check has no record of that kind to compare against, so
// there's nothing to call verified or broken. That's the case for DKIM on
// every domain right now, since GET /api/domains/{id}/dns returns no
// _domainkey records; showing it red would flag every domain as broken.
type Check = boolean | null;

interface Health {
  mx: Check;
  spf: Check;
  dkim: Check;
}

function check(records: DnsRecordCheck[]): Check {
  return records.length === 0 ? null : records.some((r) => r.status === "matched");
}

function deriveHealth(records: DnsRecordCheck[]): Health {
  return {
    mx: check(records.filter((r) => r.type === "MX")),
    spf: check(records.filter((r) => r.type === "TXT" && r.expected.includes("v=spf1"))),
    dkim: check(records.filter((r) => r.type === "TXT" && r.name.includes("_domainkey"))),
  };
}

function needsAttention(domain: Domain, health: Health | undefined) {
  if (domain.status !== "active") return true;
  return health !== undefined && (health.mx === false || health.spf === false || health.dkim === false);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function headlineFor(domains: Domain[], attention: Domain[]) {
  if (domains.length === 0) return "Add your first domain";
  if (attention.length === 0) {
    if (domains.length === 1) return "Your domain is ready";
    return domains.length === 2 ? "Both domains are ready" : `All ${domains.length} domains are ready`;
  }
  return `${attention.length} of ${domains.length} ${domains.length === 1 ? "domain needs" : "domains need"} attention`;
}

function HealthCheck({ label, ok }: { label: string; ok: Check }) {
  const state = ok === null ? "unknown" : ok ? "ok" : "fail";
  const description = ok === null ? "not checked" : ok ? "verified" : "not verified";
  return (
    <span className={`health-check ${state}`} title={`${label} ${description}`}>
      <span className="health-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function ChecklistItem({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li>
      {done ? (
        <CheckBadge />
      ) : (
        <span className="material-symbols-outlined dashboard-warn" aria-hidden="true">
          error
        </span>
      )}
      {children}
    </li>
  );
}

export function DomainsPage() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [health, setHealth] = useState<Record<string, Health>>({});

  useEffect(() => {
    let cancelled = false;

    api.listDomains().then(async (list) => {
      if (cancelled) return;
      setDomains(list);

      const entries = await Promise.all(
        list.map(async (d) => {
          try {
            const { records } = await api.getDomainDns(d.id);
            return [d.id, deriveHealth(records)] as const;
          } catch {
            // A failed lookup says nothing about the records themselves.
            return [d.id, { mx: null, spf: null, dkim: null }] as const;
          }
        }),
      );
      if (!cancelled) setHealth(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const attention = domains?.filter((d) => needsAttention(d, health[d.id])) ?? [];
  const ready = domains ? domains.length - attention.length : 0;
  const active = domains?.filter((d) => d.status === "active").length ?? 0;
  const healthLoaded = domains !== null && domains.every((d) => health[d.id] !== undefined);

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <div className="dashboard-columns">
          <div className="dashboard-main">
            <p className="dashboard-welcome-label">Email Domains</p>
            <h1 className="dashboard-headline">
              {domains === null || !healthLoaded ? (
                <span className="skeleton-line" style={{ width: "22rem", height: "2.2rem" }} />
              ) : (
                headlineFor(domains, attention)
              )}
            </h1>

            {domains !== null && domains.length > 0 && healthLoaded && (
              <ul className="dashboard-checklist">
                <ChecklistItem done={active === domains.length}>
                  {active} of {domains.length} active
                </ChecklistItem>
                <ChecklistItem done={ready === domains.length}>
                  {ready} of {domains.length} with DNS set up
                </ChecklistItem>
              </ul>
            )}
            {domains !== null && domains.length === 0 && (
              <ul className="dashboard-checklist">
                <li>
                  <CheckBadge />
                  Bring a domain you already own
                </li>
                <li>
                  <CheckBadge />
                  We show you every DNS record to set
                </li>
              </ul>
            )}

            <Link to="/domains/new" className="dashboard-cta">
              Add a domain
            </Link>
          </div>

          <div className="dashboard-secondary">
            <p className="dashboard-secondary-label">Quick links</p>

            {attention[0] && (
              <div className="dashboard-secondary-block">
                <p>Finish the DNS setup for {attention[0].name}.</p>
                <Link to={`/domains/${attention[0].id}/dns`}>Check DNS records</Link>
              </div>
            )}

            <div className="dashboard-secondary-block">
              <p>MX, SPF and DKIM on each card show which DNS records we could verify.</p>
              {domains?.[0] && <Link to={`/domains/${domains[0].id}/dns/records`}>View DNS records</Link>}
            </div>

            <div className="dashboard-secondary-block">
              <p>Need a hand with DNS? Our support team is here for you.</p>
              <Link to="/support">Contact Support</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-cards-section">
        <h2 className="dashboard-cards-heading">Your domains</h2>

        <div className="domain-card-grid">
          {domains === null
            ? Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="domain-card domain-card-skeleton" aria-hidden="true">
                  <span className="skeleton-line" style={{ width: "8rem" }} />
                  <span className="skeleton-line" style={{ width: "5rem" }} />
                </div>
              ))
            : domains.map((d) => {
                const h = health[d.id];
                return (
                  <Link key={d.id} to={`/domains/${d.id}/mailboxes`} className="domain-card">
                    <span className="domain-card-top">
                      <DomainIcon />
                      <span className="action-card-main">
                        <span className="action-card-title">{d.name}</span>
                        <span className="action-card-subtitle">Added {formatDate(d.createdAt)}</span>
                      </span>
                      <Tag status={d.status} />
                    </span>
                    <span className="domain-card-health">
                      {h ? (
                        <>
                          <HealthCheck label="MX" ok={h.mx} />
                          <HealthCheck label="SPF" ok={h.spf} />
                          <HealthCheck label="DKIM" ok={h.dkim} />
                        </>
                      ) : (
                        <span className="skeleton-line" style={{ width: "9rem" }} />
                      )}
                    </span>
                  </Link>
                );
              })}

          {domains !== null && (
            <Link to="/domains/new" className="domain-card domain-card-add">
              <span className="material-symbols-outlined" aria-hidden="true">
                add
              </span>
              Add a domain
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
