import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, API_URL, type DnsRecordCheck } from "../api/client";

export function DnsOverviewPage() {
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
  const mismatchCount = records?.filter((r) => r.status === "mismatch").length ?? 0;
  const missingCount = records?.filter((r) => r.status === "missing").length ?? 0;
  const allMatched = records !== null && records.length > 0 && matchedCount === records.length;

  return (
    <div>
      <div className="page-header">
        <h1>DNS Overview</h1>
        <div className="page-header-actions">
          <md-outlined-button type="button" onClick={reload} disabled={checking}>
            {checking ? "Checking…" : "Recheck DNS"}
          </md-outlined-button>
          {applyUrl && <md-filled-button href={applyUrl}>Fix with Cloudflare</md-filled-button>}
        </div>
      </div>
      <p className="introduction">A live summary of this domain's DNS health. See DNS Config for the full record list.</p>

      {records !== null && (
        <>
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

          <div className="material-card" style={{ marginTop: "1rem" }}>
            <div className="dns-table">
              <div className="dns-row dns-row-head">
                <span>Status</span>
                <span>Count</span>
              </div>
              <div className="dns-row">
                <span>
                  <span className="tag green">Matched</span>
                </span>
                <span>{matchedCount}</span>
              </div>
              <div className="dns-row">
                <span>
                  <span className="tag red">Mismatch</span>
                </span>
                <span>{mismatchCount}</span>
              </div>
              <div className="dns-row">
                <span>
                  <span className="tag red">Missing</span>
                </span>
                <span>{missingCount}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <p className="light" style={{ marginTop: "1rem" }}>
        Need the exact records to add at your DNS provider?{" "}
        <a href={`${API_URL}/api/domains/${domainId}/bind`}>Download the BIND zone file</a> or see DNS Config for the
        full table.
      </p>
    </div>
  );
}
