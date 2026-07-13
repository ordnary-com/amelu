import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type ActivityEntry } from "../api/client";

export function MailboxRecentActivityPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    if (!mailboxId) return;
    api.getMailboxActivity(mailboxId).then(setEntries);
  }, [mailboxId]);

  if (!mailboxId) return null;

  return (
    <div>
      <h1>Recent Activity</h1>
      <p className="introduction">The last events recorded for this mailbox.</p>

      <div className="material-card">
        {entries === null ? (
          <p className="light">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="material-empty-state">
            <p>No activity recorded yet.</p>
          </div>
        ) : (
          <md-list>
            {entries.map((e) => (
              <md-list-item key={e.id} type="text">
                <div slot="headline">{e.message}</div>
                <div slot="end" className="light activity-item-when">
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>
    </div>
  );
}
