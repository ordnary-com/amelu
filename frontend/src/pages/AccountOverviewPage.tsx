import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function formatLastSignIn(iso?: string) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

export function AccountOverviewPage() {
  const navigate = useNavigate();
  const { customer } = useAuth();
  if (!customer) return null;

  const goTo = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    navigate(path);
  };

  return (
    <div>
      <h1>My Account</h1>

      <div className="alert alert-warning">
        <span>
          <b>Tip:</b> Two-factor authentication isn't available yet. We'll let you know when it ships.
        </span>
      </div>

      <div className="material-card">
        <md-list>
          <md-list-item type="link" href="/account/edit" onClick={(e: React.MouseEvent) => goTo(e, "/account/edit")}>
            <div slot="headline">Name</div>
            <div slot="supporting-text">{customer.name || "Not set"}</div>
            <div slot="end" className="light">
              Manage
            </div>
          </md-list-item>
          <md-list-item
            type="link"
            href="/account/email"
            onClick={(e: React.MouseEvent) => goTo(e, "/account/email")}
          >
            <div slot="headline">Sign-in Email</div>
            <div slot="supporting-text">{customer.email}</div>
            <div slot="end" className="light">
              Manage
            </div>
          </md-list-item>
          <md-list-item type="text">
            <div slot="headline">Last Sign-in</div>
            <div slot="supporting-text">{formatLastSignIn(customer.lastSignInAt)}</div>
          </md-list-item>
          <md-list-item type="text">
            <div slot="headline">Second Factor Auth</div>
            <div slot="end">
              <span className="tag">Disabled</span>
            </div>
          </md-list-item>
          <md-list-item type="text">
            <div slot="headline">Permissions Level</div>
            <div slot="end" className="light">
              Owner
            </div>
          </md-list-item>
        </md-list>
      </div>
    </div>
  );
}
