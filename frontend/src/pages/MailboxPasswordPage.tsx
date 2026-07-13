import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function MailboxPasswordPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  if (!mailboxId) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.setMailboxPassword(mailboxId, password);
      setPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSent(false);
    setInviteBusy(true);
    try {
      await api.inviteMailboxPassword(mailboxId, recoveryEmail);
      setInviteSent(true);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Could not send invite");
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <div className="settings-form">
      <h1>Mailbox Password</h1>
      <p>
        To change this mailbox password, enter a new one below, or send a password setup link to the mailbox
        owner's recovery address instead.
      </p>

      <h4>Send Password Reset Link</h4>
      <p className="light">
        Sends a one-time link, valid for 24 hours, that lets the recipient set their own password without you
        seeing or choosing it.
      </p>
      <form onSubmit={sendInvite}>
        <div className="field">
          <md-outlined-text-field
            label="Recovery email"
            type="email"
            placeholder="eg. person@theirotheraddress.com"
            value={recoveryEmail}
            onInput={(e) => setRecoveryEmail((e.target as unknown as { value: string }).value)}
            required
          />
        </div>

        {inviteError && (
          <div className="alert alert-error">
            <span>{inviteError}</span>
          </div>
        )}
        {inviteSent && (
          <div className="alert alert-info">
            <span>Invite sent.</span>
          </div>
        )}

        <div className="field-action">
          <md-outlined-button type="submit" disabled={inviteBusy}>
            Send Password Reset Link
          </md-outlined-button>
        </div>
      </form>

      <h4>Set New Password</h4>
      <form onSubmit={submit}>
        <div className="field">
          <md-outlined-text-field
            label="Password"
            type="password"
            placeholder="eg. not 123456 or qwertz"
            value={password}
            onInput={(e) => setPassword((e.target as unknown as { value: string }).value)}
            required
            minlength={8}
          />
        </div>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="alert alert-info">
            <span>Password changed.</span>
          </div>
        )}

        <div className="field-action">
          <md-filled-button type="submit" disabled={busy}>
            Change Password
          </md-filled-button>
        </div>
      </form>
    </div>
  );
}
