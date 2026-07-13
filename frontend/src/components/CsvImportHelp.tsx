import { SidePanel } from "./SidePanel";

const FIELDS = [
  {
    name: "Name",
    description: "Required, name of the mailbox owner. Used only for organizational purposes within this panel.",
  },
  {
    name: "Address",
    description: "Required, address of the mailbox to create. Only local part is considered while the domain is ignored.",
  },
  {
    name: "Password",
    description:
      "If present, the mailbox password, minimum 8 characters. If left empty, a password is generated and shown once on the results page instead.",
  },
  { name: "InviteEmail", description: "Not implemented yet - ignored if present." },
  { name: "ForwardEmail", description: "Not implemented yet - ignored if present." },
  { name: "ExpirationDate", description: "Not implemented yet - ignored if present." },
  { name: "RemoveUponExpiration", description: "Not implemented yet - ignored if present." },
];

const EXAMPLES = ["Bob, bob@domain.tld, s3cReTPa55,,,,", "Alice, alice@domain.tld,,,,,", "Evan Spy, evan@spy.tld, pa$$word,,,,"];

export function CsvImportHelp() {
  return (
    <SidePanel title="Acceptable CSV Format">
      <p>
        To create mailboxes from CSV, you must have the correct format and order. Our parser expects{" "}
        <strong>exactly</strong> the following order of fields as given below. Only comma is an acceptable
        separator.
      </p>

      <code className="csv-format">{FIELDS.map((f) => f.name).join(", ")}</code>

      <p>
        The descriptive header in the first row should not be present. You should have exactly 6 commas on each
        line.
      </p>

      <dl className="csv-fields">
        {FIELDS.map((f) => (
          <div key={f.name}>
            <dt>{f.name}</dt>
            <dd>{f.description}</dd>
          </div>
        ))}
      </dl>

      <h4>Examples</h4>
      <pre className="csv-examples">{EXAMPLES.join("\n")}</pre>
    </SidePanel>
  );
}
