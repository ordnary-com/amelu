import { Link } from "react-router-dom";

const CONTACT_URL = "https://ordnary.com/contact";

export function SupportPage() {
  return (
    <div>
      <h1>Contact Support</h1>
      <p className="introduction">Get help with your Amelu account, domains, DNS, or mail delivery.</p>

      <div className="material-card">
        <h2>Contact us</h2>
        <p>
          Reach us through the <a href={CONTACT_URL}>Ordnary contact page</a>. Include the affected domain, the
          approximate time of the problem, and any error message or bounce you received.
        </p>
        <p className="action">
          <a className="button-pill" href={CONTACT_URL}>
            Go to contact page
          </a>
        </p>
      </div>

      <p className="light" style={{ marginTop: "1rem" }}>
        Check <Link to="/status">Service Status</Link> for known incidents. Report abuse through the same{" "}
        <a href={CONTACT_URL}>contact page</a>.
      </p>
    </div>
  );
}
