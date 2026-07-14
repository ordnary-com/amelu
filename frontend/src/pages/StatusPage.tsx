import { Tag } from "../components/Tag";

interface ServiceStatus {
  name: string;
  description: string;
  status: "operational" | "degraded" | "outage";
}

// Static status list - there's no monitoring backend feeding this yet, so
// components are reported operational by hand. Wire this up to a real
// health-check source before relying on it during an actual incident.
const SERVICES: ServiceStatus[] = [
  { name: "Mail Delivery", description: "Inbound and outbound message routing", status: "operational" },
  { name: "IMAP / POP3", description: "Mailbox access for mail clients", status: "operational" },
  { name: "SMTP Sending", description: "Outgoing mail submission", status: "operational" },
  { name: "Webmail", description: "Browser-based mailbox access", status: "operational" },
  { name: "API", description: "Account, domain, and mailbox management", status: "operational" },
  { name: "DNS Verification", description: "Domain and DNS record checks", status: "operational" },
  { name: "Billing", description: "Stripe-backed subscription and invoicing", status: "operational" },
];

const allOperational = SERVICES.every((s) => s.status === "operational");

export function StatusPage() {
  return (
    <div>
      <h1>Service Status</h1>
      <p className="introduction">Current status of Amelu's services.</p>

      <div className={`alert ${allOperational ? "alert-info" : "alert-warning"}`}>
        <span>{allOperational ? "All systems operational" : "Some systems are experiencing issues"}</span>
      </div>

      <div className="material-card">
        <md-list>
          {SERVICES.map((s) => (
            <md-list-item key={s.name} type="text">
              <div slot="headline">{s.name}</div>
              <div slot="supporting-text">{s.description}</div>
              <div slot="end">
                <Tag status={s.status} />
              </div>
            </md-list-item>
          ))}
        </md-list>
      </div>
    </div>
  );
}
