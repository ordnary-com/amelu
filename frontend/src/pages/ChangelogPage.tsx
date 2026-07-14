interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  notes: string[];
}

// Static release history - no backend model for this yet, entries are
// added here by hand alongside each release.
const ENTRIES: ChangelogEntry[] = [
  {
    version: "2026.7.1",
    date: "2026-07-10",
    title: "Billing plans and invoices",
    notes: [
      "Added billing interval selection and plan cancellation from Billing → Plans.",
      "Invoices now sync directly from Stripe and are listed under Billing → Invoices.",
    ],
  },
  {
    version: "2026.6.2",
    date: "2026-06-18",
    title: "Mailbox activity and pattern rewrites",
    notes: [
      "New mailboxes and address pattern rewrites can now be created from the domain sidebar.",
      "Added spam aggressiveness settings and recipient/sender denylists per domain.",
    ],
  },
  {
    version: "2026.6.1",
    date: "2026-06-02",
    title: "Domain aliases and Bcc captures",
    notes: [
      "Domains can now have alias domains attached and managed independently.",
      "Added Bcc capture rules for silently copying mail to another address.",
    ],
  },
];

export function ChangelogPage() {
  return (
    <div>
      <h1>Changelog</h1>
      <p className="introduction">What's new in Amelu.</p>

      <div className="material-card">
        <md-list>
          {ENTRIES.map((entry) => (
            <md-list-item key={entry.version} type="text">
              <div slot="headline">{entry.title}</div>
              <div slot="supporting-text">{entry.notes.join(" ")}</div>
              <div slot="end" className="domain-item-end">
                <span className="light">{entry.version}</span>
                <span className="light">{new Date(entry.date).toLocaleDateString()}</span>
              </div>
            </md-list-item>
          ))}
        </md-list>
      </div>
    </div>
  );
}
