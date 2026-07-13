import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type Mailbox } from "../api/client";

const SERVER_HOSTNAME = "marduk.mx.amelu.org";

export function MailboxUsageInstructionsPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);

  useEffect(() => {
    if (!mailboxId) return;
    api.getMailbox(mailboxId).then(setMailbox);
  }, [mailboxId]);

  if (!mailboxId || !mailbox) return null;

  return (
    <div>
      <h1>Usage Instructions</h1>
      <p>To correctly configure your email client, you will need the correct server parameters. Please find them below.</p>

      <h4>Incoming Mail</h4>
      <div className="material-card">
        <div className="kv-table">
          <div className="kv-row">
            <span className="kv-row-label">Protocol</span>
            <span>IMAP</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Server</span>
            <span className="dns-mono">{SERVER_HOSTNAME}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Port</span>
            <span>993</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Security</span>
            <span>TLS</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Username</span>
            <span>{mailbox.address}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Password</span>
            <span className="light">(mailbox password)</span>
          </div>
        </div>
      </div>

      <h4>Outgoing Mail</h4>
      <div className="material-card">
        <div className="kv-table">
          <div className="kv-row">
            <span className="kv-row-label">Protocol</span>
            <span>SMTP</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Server</span>
            <span className="dns-mono">{SERVER_HOSTNAME}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Port</span>
            <span>465</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Security</span>
            <span>TLS</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Username</span>
            <span>{mailbox.address}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Password</span>
            <span className="light">(mailbox password)</span>
          </div>
        </div>
      </div>

      <h4>ManageSieve</h4>
      <div className="material-card">
        <div className="kv-table">
          <div className="kv-row">
            <span className="kv-row-label">Protocol</span>
            <span>ManageSieve</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Server</span>
            <span className="dns-mono">{SERVER_HOSTNAME}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Port</span>
            <span>4190</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Security</span>
            <span>StartTLS</span>
          </div>
        </div>
      </div>

      <div className="alert alert-warning" style={{ marginTop: "1.5rem" }}>
        <span>
          <b>Note:</b> POP3 and SMTP over StartTLS (port 587) aren't available on this cluster yet - only the
          ports listed above are open. Use IMAP and implicit TLS submission (port 465) for now.
        </span>
      </div>
    </div>
  );
}
