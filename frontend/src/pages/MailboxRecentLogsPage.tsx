import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type RecentEmail, type RecentLogs } from "../api/client";
import { TableSkeleton } from "../components/TableSkeleton";

function EmailTable({ emails, emptyLabel }: { emails: RecentEmail[] | null; emptyLabel: string }) {
  return (
    <div className="material-card">
      {emails !== null && emails.length === 0 ? (
        <div className="material-empty-state">
          <p>{emptyLabel}</p>
        </div>
      ) : (
        <table width="100%">
          <thead>
            <tr>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
              <th>Subject</th>
            </tr>
          </thead>
          <tbody>
            {emails === null ? (
              <TableSkeleton columns={4} />
            ) : (
              emails.map((e) => (
                <tr key={e.id}>
                  <td className="light" style={{ whiteSpace: "nowrap" }}>
                    {new Date(e.receivedAt).toLocaleString()}
                  </td>
                  <td>{e.from.join(", ")}</td>
                  <td>{e.to.join(", ")}</td>
                  <td>{e.subject}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function MailboxRecentLogsPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const [logs, setLogs] = useState<RecentLogs | null>(null);

  useEffect(() => {
    if (!mailboxId) return;
    api.getMailboxLogs(mailboxId).then(setLogs);
  }, [mailboxId]);

  if (!mailboxId) return null;

  return (
    <div>
      <h1>Recent Traffic Logs</h1>

      <h4>Outgoing Messages</h4>
      <EmailTable emails={logs?.outgoing ?? null} emptyLabel="No recent messages." />

      <h4>Incoming Messages</h4>
      <EmailTable emails={logs?.incoming ?? null} emptyLabel="No recent messages." />
    </div>
  );
}
