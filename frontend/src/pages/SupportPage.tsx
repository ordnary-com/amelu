import { Link } from "react-router-dom";

const SUPPORT_EMAIL = "support@ordnary.com";

export function SupportPage() {
  return (
    <div>
      <h1>Contact Support</h1>
      <p className="introduction">Get help with your Amelu account, domains, DNS, or mail delivery.</p>

      <div className="material-card">
        <h2>Email support</h2>
        <p>
          Send your request to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Include the affected domain,
          the approximate time of the problem, and any error message or bounce you received.
        </p>
        <p className="action">
          <a className="button-pill" href={`mailto:${SUPPORT_EMAIL}?subject=Amelu%20support%20request`}>
            Email support
          </a>
        </p>
      </div>

      <p className="light" style={{ marginTop: "1rem" }}>
        Check <Link to="/status">Service Status</Link> for known incidents. Report abuse separately to{" "}
        <a href="mailto:abuse@ordnary.com">abuse@ordnary.com</a>.
      </p>
    </div>
  );
}
