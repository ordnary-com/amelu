import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, ApiError, type Invitation, type Member, type OrganizationRole } from "../api/client";
import { ListSkeleton } from "../components/ListSkeleton";

const ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: "Owner",
  admin: "Admin",
  helpdesk: "Helpdesk",
  billing: "Billing",
  read_only: "Read only",
};

const ROLE_TAG_CLASS: Record<OrganizationRole, string> = {
  owner: "tag green",
  admin: "tag green",
  helpdesk: "tag orange",
  billing: "tag orange",
  read_only: "tag",
};

const ASSIGNABLE_ROLES: OrganizationRole[] = ["owner", "admin", "helpdesk", "billing", "read_only"];

function canManageTeam(role: OrganizationRole | undefined) {
  return role === "owner" || role === "admin";
}

export function MyOrganizationPage() {
  const { customer } = useAuth();

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("read_only");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [devInviteUrl, setDevInviteUrl] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const canManage = canManageTeam(customer?.role);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [m, i] = await Promise.all([
        api.listOrganizationMembers(),
        canManageTeam(customer?.role) ? api.listOrganizationInvitations() : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvitations(i);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load organization");
    }
  }, [customer?.role]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!customer) return null;

  const changeRole = async (memberId: string, role: OrganizationRole) => {
    setError(null);
    try {
      await api.updateMemberRole(memberId, role);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update role");
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    setError(null);
    try {
      await api.removeMember(removeTarget.id);
      setRemoveTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove member");
    } finally {
      setRemoving(false);
    }
  };

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInviteSuccess(null);
    setDevInviteUrl(null);
    setInviting(true);
    try {
      const result = await api.createInvitation(inviteEmail, inviteRole);
      setInviteSuccess(
        result.emailSent
          ? `Invitation sent to ${result.email}.`
          : `Invitation created for ${result.email}, but email delivery isn't configured on this server.`,
      );
      if (result.devInviteUrl) setDevInviteUrl(result.devInviteUrl);
      setInviteEmail("");
      setInviteRole("read_only");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send invitation");
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await api.revokeInvitation(id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revoke invitation");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>My Organization</h1>
        <div className="page-header-actions">
          <Link to="/organization/activity" className="dashboard-cta">
            Activity Log
          </Link>
        </div>
      </div>
      <p className="introduction">Manage your organization's details, team members, and invitations.</p>

      <div className="material-card">
        <div className="kv-table">
          <div className="kv-row">
            <span className="kv-row-label">Organization Name</span>
            <span>{customer.organizationName}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Plan</span>
            <span>{customer.planTierName}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Your Role</span>
            <span className={ROLE_TAG_CLASS[customer.role]}>{ROLE_LABELS[customer.role]}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="settings-form settings-form-wide">
        <h4>Team Members</h4>
        <p className="light">Invite teammates to help manage this organization's domains and mailboxes.</p>

        <div className="material-card">
          {members === null ? (
            <ListSkeleton />
          ) : (
            <md-list>
              {members.map((m) => (
                <md-list-item key={m.id} type="text">
                  <div slot="headline">
                    {m.name} {m.isSelf && <span className="light">(you)</span>}
                  </div>
                  <div slot="supporting-text">{m.email}</div>
                  <div slot="end" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {canManage && !m.isSelf ? (
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value as OrganizationRole)}
                        disabled={customer.role !== "owner" && m.role === "owner"}
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r} disabled={r === "owner" && customer.role !== "owner"}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={ROLE_TAG_CLASS[m.role]}>{ROLE_LABELS[m.role]}</span>
                    )}
                    {canManage && !m.isSelf && (
                      <button
                        type="button"
                        className="button-pill-outline button-pill-danger"
                        onClick={() => setRemoveTarget(m)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </md-list-item>
              ))}
            </md-list>
          )}
        </div>

        {canManage && (
          <>
            <h4>Pending Invitations</h4>
            <div className="material-card">
              {invitations === null ? (
                <ListSkeleton />
              ) : invitations.length === 0 ? (
                <div className="material-empty-state">
                  <span className="material-empty-icon">@</span>
                  <p>No pending invitations.</p>
                </div>
              ) : (
                <md-list>
                  {invitations.map((inv) => (
                    <md-list-item key={inv.id} type="text">
                      <div slot="headline">{inv.email}</div>
                      <div slot="supporting-text">
                        Invited as {ROLE_LABELS[inv.role]}
                        {inv.expired && " · expired"}
                      </div>
                      <div slot="end">
                        <button
                          type="button"
                          className="button-pill-outline button-pill-danger"
                          onClick={() => revoke(inv.id)}
                        >
                          {inv.expired ? "Remove" : "Revoke"}
                        </button>
                      </div>
                    </md-list-item>
                  ))}
                </md-list>
              )}
            </div>

            <h4>Invite a Teammate</h4>
            <form onSubmit={sendInvite}>
              <div className="field">
                <md-outlined-text-field
                  label="Invite by email"
                  type="email"
                  placeholder="eg. teammate@example.com"
                  value={inviteEmail}
                  onInput={(e) => setInviteEmail((e.target as unknown as { value: string }).value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="invite-role">
                  <span>Role</span>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as OrganizationRole)}
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r} disabled={r === "owner" && customer.role !== "owner"}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {inviteSuccess && (
                <div className="alert alert-info">
                  <span>{inviteSuccess}</span>
                </div>
              )}
              {devInviteUrl && (
                <div className="alert alert-warning">
                  <span>
                    Dev-only invite link (no Resend configured):{" "}
                    <a href={devInviteUrl}>{devInviteUrl}</a>
                  </span>
                </div>
              )}

              <div className="field-action">
                <md-filled-button type="submit" disabled={inviting}>
                  Send Invite
                </md-filled-button>
              </div>
            </form>
          </>
        )}
      </div>

      <md-dialog open={!!removeTarget}>
        <div slot="headline">Remove {removeTarget?.name} from the organization?</div>
        <div slot="content">
          This immediately deletes their Amelu account and revokes their access to every domain and mailbox in
          this organization. There is no way to recover this account afterwards.
        </div>
        <div slot="actions">
          <md-text-button type="button" onClick={() => setRemoveTarget(null)} disabled={removing}>
            Cancel
          </md-text-button>
          <md-filled-button type="button" className="md-button-error" onClick={confirmRemove} disabled={removing}>
            Yes, remove them
          </md-filled-button>
        </div>
      </md-dialog>
    </div>
  );
}
