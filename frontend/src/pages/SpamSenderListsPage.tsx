import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function SpamSenderListsPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const [denylist, setDenylist] = useState("");
  const [junklist, setJunklist] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domainId) return;
    api.getSpamSenderLists(domainId).then((lists) => {
      setDenylist(lists.denylist);
      setJunklist(lists.junklist);
      setLoaded(true);
    });
  }, [domainId]);

  if (!domainId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.updateSpamSenderLists(domainId, { denylist, junklist });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save sender lists");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form settings-form-wide">
      <h1>Sender Denylist</h1>

      <p>
        Any sender address that matches an entry in this denylist is silently dropped. Messages matching listed
        senders will not land in the Junk folder of the recipients.
      </p>
      <p>
        You can use the asterisk wildcard here, e.g. <i>*@domain.com</i>, <i>spam@*.ru</i>, or even <i>*@*.br</i>.
        Use with care and try to be as explicit as possible to avoid delivery problems.
      </p>
      <p>
        If you instead want to accept matched messages but explicitly sort them as Junk, list them in the
        junklist below. The junklist takes precedence over the denylist.
      </p>

      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Denylist"
            type="textarea"
            rows={8}
            placeholder="email addresses or wildcard rules, e.g. *@domain.com"
            disabled={!loaded}
            value={denylist}
            onInput={(e) => setDenylist((e.target as unknown as { value: string }).value)}
          />
        </div>

        <div className="field">
          <md-outlined-text-field
            label="Junklist"
            type="textarea"
            rows={8}
            placeholder="email addresses or wildcard rules, e.g. *@domain.com"
            disabled={!loaded}
            value={junklist}
            onInput={(e) => setJunklist((e.target as unknown as { value: string }).value)}
          />
        </div>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="alert alert-info">
            <span>Saved.</span>
          </div>
        )}

        <div className="field-action">
          <md-filled-button type="submit" disabled={busy || !loaded}>
            Save Changes
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
