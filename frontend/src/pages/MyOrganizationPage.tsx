import { useAuth } from "../context/AuthContext";

export function MyOrganizationPage() {
  const { customer } = useAuth();
  if (!customer) return null;

  return (
    <div>
      <h1>My Organization</h1>
      <p className="introduction">Manage your organization's details, team members, and ownership.</p>

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
            <span className="kv-row-label">Owner</span>
            <span>
              {customer.name} <span className="light">({customer.email})</span>
            </span>
          </div>
        </div>
      </div>

      <div className="settings-form settings-form-wide">
        <h4>Team Members</h4>
        <p className="light">Invite teammates to help manage this organization's domains and mailboxes.</p>

        <div className="material-card">
          <md-list>
            <md-list-item type="text">
              <div slot="headline">{customer.name}</div>
              <div slot="supporting-text">{customer.email}</div>
              <div slot="end">
                <span className="tag green">Owner</span>
              </div>
            </md-list-item>
          </md-list>
        </div>

        <div className="alert alert-warning" style={{ marginTop: "1rem" }}>
          <span>
            <b>Not available yet:</b> Amelu currently supports a single owner per organization. Multi-user teams
            and invitations are on our roadmap.
          </span>
        </div>

        <div className="field">
          <md-outlined-text-field label="Invite by email" placeholder="eg. teammate@example.com" disabled />
        </div>
        <div className="field-action">
          <md-filled-button type="button" disabled>
            Send Invite
          </md-filled-button>
        </div>

        <h4>Transfer Organization Ownership</h4>
        <p className="light">
          Move this entire organization, including every domain and mailbox under it, to another Amelu account.
        </p>

        <div className="alert alert-warning">
          <span>
            <b>Not available yet:</b> organization transfer is on our roadmap. To move a single domain now, use{" "}
            <i>Transfer Ownership</i> on that domain's settings instead.
          </span>
        </div>

        <div className="field">
          <md-outlined-text-field label="New owner's email" type="email" placeholder="eg. someone@example.com" disabled />
        </div>
        <div className="field-action">
          <md-filled-button type="button" className="md-button-error" disabled>
            Transfer Organization
          </md-filled-button>
        </div>
      </div>
    </div>
  );
}
