import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useSnackbar } from "../context/SnackbarContext";

const DEFAULT_ADDRESSES = ["admin", "postmaster", "abuse"];

interface CreatedAddress {
  address: string;
  password?: string;
}

const TIPS = [
  {
    title: "Skip the www",
    body: "The domain name is just the part after the @ symbol, like yourdomain.com — not www.yourdomain.com.",
  },
  {
    title: "DNS changes are required",
    body: "Once your domain is created, we'll show you exactly which DNS records to add and verify them live against what's published.",
  },
  {
    title: "Default addresses save a step",
    body: "admin, postmaster and abuse are required by email standards. We can create them for you automatically with generated passwords.",
  },
];

function TipsCard() {
  const [step, setStep] = useState(0);
  const tip = TIPS[step];

  return (
    <div className="tips-card">
      <div className="tips-card-header">
        <span className="tips-card-label">Tip {step + 1} of {TIPS.length}</span>
        <div className="tips-card-dots">
          {TIPS.map((_, i) => (
            <span key={i} className={`tips-card-dot ${i === step ? "active" : ""}`} />
          ))}
        </div>
      </div>
      <h4>{tip.title}</h4>
      <p>{tip.body}</p>
      <div className="tips-card-nav">
        <button
          type="button"
          className="button-pill-outline"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </button>
        <button
          type="button"
          className="button-pill-outline"
          disabled={step === TIPS.length - 1}
          onClick={() => setStep((s) => Math.min(TIPS.length - 1, s + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function NewDomainPage() {
  const { showSnackbar } = useSnackbar();
  const [name, setName] = useState("");
  const [createDefaultAddresses, setCreateDefaultAddresses] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ domainId: string; addresses: CreatedAddress[] } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const domain = await api.createDomain(name.trim());

      const addresses: CreatedAddress[] = [];
      if (createDefaultAddresses) {
        for (const localPart of DEFAULT_ADDRESSES) {
          const mailbox = await api.createMailbox(domain.id, localPart);
          addresses.push({ address: mailbox.address, password: mailbox.generatedPassword });
        }
      }

      setResult({ domainId: domain.id, addresses });
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Could not create domain", "error");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div>
        <h1>Domain Added</h1>
        {result.addresses.length > 0 && (
          <>
            <p>These addresses were created with generated passwords, shown only once:</p>
            {result.addresses.map((a) => (
              <p key={a.address}>
                <strong>{a.address}</strong>
                <br />
                <span className="api-token">{a.password}</span>
              </p>
            ))}
          </>
        )}
        <p className="action">
          <Link className="button-pill" to={`/domains/${result.domainId}/mailboxes`}>
            Go to domain
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="new-domain-layout">
      <div className="new-domain-form">
        <h1>Add New Email Domain</h1>
        <form onSubmit={submit}>
          <p>
            The domain name is the part after the "@" symbol in email addresses. You most likely{" "}
            <b>do not want the www subdomain</b> there, though it is allowed.
          </p>

          <p>
            <md-outlined-text-field
              label="Domain name"
              placeholder="eg. mydomain.com"
              value={name}
              onInput={(e) => setName((e.target as unknown as { value: string }).value)}
              required
              autoFocus
            />
          </p>

          <h4>DNS Nameservers</h4>
          <p>
            Email is tightly integrated with the Domain Name System (DNS), which means some changes are required
            in your DNS records.
          </p>
          <p>
            We plan to offer a complementary, auto-configured DNS service through our own nameservers, but for now
            you'll keep your existing, external nameservers and add the required records yourself. Once the
            domain is created, its exact records and their live verification status are shown on the DNS
            Configuration page.
          </p>
          <div className="segmented-control" role="radiogroup" aria-label="Nameservers">
            <label className="segmented-option segmented-option-active">
              <md-radio name="nameservers" value="external" checked />
              Use external nameservers
            </label>
            <label className="segmented-option segmented-option-disabled">
              <md-radio name="nameservers" value="amelu" disabled />
              Use Amelu nameservers
            </label>
          </div>
          <p className="light">External nameservers is the common choice today; hosted Amelu nameservers are coming soon.</p>

          <h4>Default Email Addresses</h4>
          <p>
            According to email standards, some addresses (admin, postmaster, abuse) must exist on your domain. We
            recommend adding these right away.
          </p>
          <p className="md-radio-row">
            <label className="md-radio-label">
              <md-checkbox
                checked={createDefaultAddresses}
                onChange={(e) => setCreateDefaultAddresses((e.target as unknown as { checked: boolean }).checked)}
              />
              Create default addresses
            </label>
          </p>

          <p className="action">
            <md-filled-button type="submit" disabled={busy}>
              Add Email Domain
            </md-filled-button>
          </p>
        </form>
      </div>

      <TipsCard />
    </div>
  );
}
