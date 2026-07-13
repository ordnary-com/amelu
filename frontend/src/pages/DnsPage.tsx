import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, API_URL, type DnsRecordCheck } from "../api/client";

const STATUS_LABEL: Record<DnsRecordCheck["status"], string> = {
  matched: "Matched",
  mismatch: "Mismatch",
  missing: "Missing",
  unchecked: "Not verified",
};

const STATUS_CLASS: Record<DnsRecordCheck["status"], string> = {
  matched: "tag green",
  mismatch: "tag red",
  missing: "tag red",
  unchecked: "tag orange",
};

export function DnsPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [records, setRecords] = useState<DnsRecordCheck[] | null>(null);
  const [applyUrl, setApplyUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const reload = useCallback(async () => {
    if (!domainId) return;
    setChecking(true);
    try {
      const { records } = await api.getDomainDns(domainId);
      setRecords(records);
    } finally {
      setChecking(false);
    }
  }, [domainId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!domainId) return;
    api
      .getDomainConnect(domainId)
      .then((status) => setApplyUrl(status.supported ? (status.applyUrl ?? null) : null))
      .catch(() => setApplyUrl(null));
  }, [domainId]);

  if (!domainId) return null;

  const matchedCount = records?.filter((r) => r.status === "matched").length ?? 0;
  const allMatched = records !== null && records.length > 0 && matchedCount === records.length;

  return (
    <div>
      <div className="page-header">
        <h1>DNS Configuration</h1>
        <div className="page-header-actions">
          <md-outlined-button type="button" onClick={reload} disabled={checking}>
            {checking ? "Checking…" : "Recheck DNS"}
          </md-outlined-button>
          <md-outlined-button href={`${API_URL}/api/domains/${domainId}/bind`}>
            Download BIND Zone
          </md-outlined-button>
          {applyUrl && <md-filled-button href={applyUrl}>Fix with Cloudflare</md-filled-button>}
        </div>
      </div>
      <p className="introduction">Add these records at your domain's DNS provider. Status reflects a live lookup.</p>

      {records !== null && (
        <div className="dns-summary">
          <span className={allMatched ? "tag green" : "tag orange"}>
            {matchedCount} / {records.length} verified
          </span>
          <span className="light">
            {allMatched
              ? "All records are correctly configured."
              : "Some records still need to be added or corrected at your DNS provider."}
          </span>
        </div>
      )}

      <div className="material-card">
        <div className="dns-table">
          <div className="dns-row dns-row-head">
            <span>Type</span>
            <span>Name</span>
            <span>Expected value</span>
            <span>Status</span>
          </div>
          {records === null
            ? Array.from({ length: 4 }, (_, i) => (
                <div className="dns-row" key={i}>
                  <span className="skeleton-line" style={{ width: "3rem" }} />
                  <span className="skeleton-line" style={{ width: `${8 + ((i * 5) % 6)}rem` }} />
                  <span className="skeleton-line" style={{ width: `${10 + ((i * 7) % 8)}rem` }} />
                  <span className="skeleton-line" style={{ width: "5rem" }} />
                </div>
              ))
            : records.map((r, i) => (
                <div className="dns-row" key={i}>
                  <span className="dns-type">{r.type}</span>
                  <span className="dns-mono wrap-words">{r.name}</span>
                  <span className="dns-mono wrap-words light">{r.expected}</span>
                  <span>
                    <span className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</span>
                  </span>
                </div>
              ))}
        </div>
      </div>

      <p className="light" style={{ marginTop: "1rem" }}>
        Prefer to configure DNS yourself? Import the downloaded zone file directly in Cloudflare (DNS &gt; Import
        and Export) or most other DNS providers.
      </p>
    </div>
  );
}
