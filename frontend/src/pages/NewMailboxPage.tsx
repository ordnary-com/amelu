import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Domain } from "../api/client";
import { useSnackbar } from "../context/SnackbarContext";

type PasswordMethod = "generate" | "password";

export function NewMailboxPage() {
  const { showSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { domainId } = useParams<{ domainId: string }>();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [localPart, setLocalPart] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passwordMethod, setPasswordMethod] = useState<PasswordMethod>("generate");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ address: string; password?: string; wasGenerated: boolean } | null>(null);

  useEffect(() => {
    if (!domainId) return;
    api.listDomains().then((domains) => setDomain(domains.find((d) => d.id === domainId) ?? null));
  }, [domainId]);

  if (!domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const mailbox = await api.createMailbox(
        domainId,
        localPart.trim(),
        displayName.trim(),
        passwordMethod === "password" ? password : "",
      );
      setResult({ address: mailbox.address, password: mailbox.password, wasGenerated: passwordMethod === "generate" });
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Could not create mailbox", "error");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="mailbox-form">
        <h1>Mailbox Added</h1>
        <p>
          <strong>{result.address}</strong> was created
          {result.password && (result.wasGenerated ? " with a generated password, shown only once" : " with the password you set")}:
        </p>
        {result.password && (
          <div className="field">
            <md-outlined-text-field
              label={result.wasGenerated ? "Generated password" : "Password"}
              value={result.password}
              readOnly
            />
          </div>
        )}
        <div className="field-action">
          <md-filled-button onClick={() => navigate(`/domains/${domainId}/mailboxes`)}>
            Return to all addresses
          </md-filled-button>
        </div>
      </div>
    );
  }

  return (
    <div className="mailbox-form">
      <h1>New Mailbox</h1>
      <p>Pick the address and its display name, then either generate a password or set one yourself.</p>

      <form onSubmit={submit} autoComplete="new-password">
        <h4>Mailbox Information</h4>
        <div className="field">
          <md-outlined-text-field
            label="Address"
            placeholder="eg. myname"
            value={localPart}
            onInput={(e) => setLocalPart((e.target as unknown as { value: string }).value)}
            suffixText={`@${domain?.name ?? ""}`}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <md-outlined-text-field
            label="Name"
            placeholder="eg. John Smith"
            value={displayName}
            onInput={(e) => setDisplayName((e.target as unknown as { value: string }).value)}
            required
          />
        </div>

        <h4>Password</h4>
        <div className="field" role="radiogroup" aria-label="Password method">
          <label className="md-radio-label">
            <md-radio
              name="password-method"
              checked={passwordMethod === "generate"}
              onChange={() => setPasswordMethod("generate")}
            />
            Generate a password for me
          </label>
          <label className="md-radio-label">
            <md-radio
              name="password-method"
              checked={passwordMethod === "password"}
              onChange={() => setPasswordMethod("password")}
            />
            Set initial password
          </label>
        </div>

        {passwordMethod === "password" && (
          <div className="field field-with-action">
            <md-outlined-text-field
              label="Password"
              type={passwordVisible ? "text" : "password"}
              autocomplete="new-password"
              placeholder="eg. not 123456 or qwertz"
              value={password}
              onInput={(e) => setPassword((e.target as unknown as { value: string }).value)}
              required={passwordMethod === "password"}
            />
            <md-text-button type="button" onClick={() => setPasswordVisible((v) => !v)}>
              {passwordVisible ? "Hide" : "Show"}
            </md-text-button>
          </div>
        )}

        <div className="field-action">
          <md-filled-button type="submit" disabled={busy}>
            Create Mailbox
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
