import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, type ActivityEntry, type Domain } from "../api/client";

interface ActivityRow extends ActivityEntry {
  domainId: string;
  domainName: string;
}

function CheckBadge() {
  return (
    <svg className="dashboard-check" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.9295 5.64928C20.2224 5.35644 20.6972 5.35654 20.9901 5.64928C21.283 5.94217 21.283 6.41693 20.9901 6.70983L9.35043 18.3495C9.05754 18.6424 8.58278 18.6424 8.28988 18.3495L2.99985 13.0594C2.70715 12.7665 2.70702 12.2917 2.99985 11.9989C3.29269 11.7063 3.76755 11.7063 4.06039 11.9989L8.82016 16.7587L19.9295 5.64928Z" />
    </svg>
  );
}

// TODO: paste SVG code for each remaining icon below, one at a time.

function DomainIcon() {
  return (
    <svg className="action-card-icon" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.4603 21.43L14.4603 15.05C14.2503 14.38 14.9403 13.78 15.5803 14.07L21.5303 16.85C22.2403 17.18 22.1203 18.22 21.3603 18.38L18.9103 18.9L18.0003 21.46C17.7403 22.19 16.6903 22.17 16.4603 21.43Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 11H15.83C14.27 11 13 9.73 13 8.17C13 7.42 13.3 6.7 13.83 6.17L16.28 3.72"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.70996 17.44L6.48996 14.78C6.80996 14.3 7.34996 14.01 7.92996 14.01C8.58996 14.01 9.18996 13.64 9.47996 13.05L9.60996 12.78C9.84996 12.29 9.84996 11.72 9.60996 11.23L8.47996 8.96999C8.18996 8.37999 7.58996 8.00999 6.92996 8.00999"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 2C6.02 2 2 6.02 2 11C2 15.98 6.02 20 11 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 11C20 6.02 15.98 2 11 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailboxIcon() {
  return (
    <svg className="action-card-icon" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.11 1.25H6.44C3.58 1.25 1.25 3.58 1.25 6.44V20.89V22C1.25 22.41 1.59 22.75 2 22.75C2.41 22.75 2.75 22.41 2.75 22V21.64H13.47V22C13.47 22.41 13.81 22.75 14.22 22.75C14.63 22.75 14.97 22.41 14.97 22V21.64H21.25V22C21.25 22.41 21.59 22.75 22 22.75C22.41 22.75 22.75 22.41 22.75 22V5.89C22.75 3.33 20.67 1.25 18.11 1.25ZM14.97 2.5C14.89 2.58 14.8 2.66 14.73 2.74C14.77 2.7 14.8 2.65 14.84 2.61C14.88 2.57 14.93 2.54 14.98 2.5H14.97ZM5.33 14.78C5.33 13.86 6.08 13.11 7 13.11H9.22C10.14 13.11 10.89 13.86 10.89 14.78C10.89 15.7 10.14 16.45 9.22 16.45H7C6.08 16.45 5.33 15.7 5.33 14.78ZM5.89 9.03H10.33C10.74 9.03 11.08 9.37 11.08 9.78C11.08 10.19 10.74 10.53 10.33 10.53H5.89C5.48 10.53 5.14 10.19 5.14 9.78C5.14 9.37 5.48 9.03 5.89 9.03ZM14.97 20.14V5.89C14.97 4.16 16.38 2.75 18.11 2.75C19.84 2.75 21.25 4.16 21.25 5.89V20.14H14.97Z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="action-card-icon" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.92 12.5003H12V1.82031L22.92 12.5003ZM13.5 11.0003H19.24L13.5 5.38033V11.0003Z" />
      <path d="M11.8301 22.4904C11.3001 22.4904 10.7601 22.4504 10.2201 22.3604C6.13015 21.7004 2.80015 18.3803 2.14015 14.2903C1.29015 9.03034 4.68015 4.07035 9.86015 3.01035L10.5901 2.86035L10.8901 4.33035L10.1602 4.48035C5.77015 5.38035 2.89014 9.58035 3.62014 14.0504C4.18014 17.5104 6.99014 20.3204 10.4501 20.8804C14.9301 21.6004 19.1302 18.7104 20.0202 14.3004L20.1701 13.5603L21.6401 13.8503L21.4902 14.5903C20.5602 19.2603 16.4701 22.4904 11.8301 22.4904Z" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg className="action-card-icon" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.59 11.75C14.3514 11.75 16.59 9.51142 16.59 6.75C16.59 3.98858 14.3514 1.75 11.59 1.75C8.82857 1.75 6.59 3.98858 6.59 6.75C6.59 9.51142 8.82857 11.75 11.59 11.75Z" />
      <path d="M20.18 21.75C20.18 17.88 16.33 14.75 11.59 14.75C6.85 14.75 3 17.88 3 21.75" />
    </svg>
  );
}

function OrgIcon() {
  return (
    <svg className="action-card-icon" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 3.12988V21.3599H12.03V5.88988L3 3.12988ZM10.01 13.8599H5.03V12.3599H10.01V13.8599ZM10.01 9.85988H5.03V8.35988H10.01V9.85988Z" />
      <path d="M17.01 12.2399V16.3599L14.01 16.3499V11.5599L17.01 12.2399Z" />
      <path d="M21.5 13.2399V16.3599H18.51V12.5699L21.5 13.2399Z" />
      <path d="M14 21.3599V17.8499H21.5V21.3599H14Z" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg className="action-card-icon" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.2601 10.58V10.26C20.2601 5.71 16.5601 2 12.0001 2C7.44012 2 3.74011 5.71 3.74011 10.26V10.58C2.83011 10.88 2.18018 11.75 2.18018 12.76V14.73C2.18018 16 3.2101 17.03 4.4801 17.03H4.74011C6.01011 17.03 7.05017 16 7.05017 14.73V12.76C7.05017 11.75 6.40011 10.89 5.49011 10.59V10.58V10.26C5.49011 6.68 8.40011 3.76 11.9901 3.76C15.5701 3.76 18.4901 6.68 18.4901 10.26V10.59C17.5801 10.89 16.9302 11.75 16.9302 12.76V14.73C16.9302 15.68 17.5201 16.51 18.3601 16.86C17.9001 18.84 16.1201 20.25 14.0901 20.25H13.0302C12.5502 20.25 12.1501 20.64 12.1501 21.13C12.1501 21.62 12.5502 22.01 13.0302 22.01H14.0901C17.0101 22.01 19.5401 19.94 20.1201 17.07C20.1301 17.03 20.1301 16.98 20.1301 16.94C21.0901 16.67 21.8002 15.78 21.8002 14.73V12.76C21.8102 11.75 21.1601 10.88 20.2601 10.58Z" />
    </svg>
  );
}

function FeatureIllustration() {
  return (
    <svg width="101" height="108" viewBox="0 0 101 108" fill="none" aria-hidden="true">
      <rect x="8" y="28" width="70" height="48" rx="6" stroke="#8ab4f8" strokeWidth="2.3" />
      <path d="M8 34l35 24 35-24" stroke="#8ab4f8" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M77 12l4.4 8.9L91 25l-9.6 4.1L77 38l-4.4-8.9L63 25l9.6-4.1z"
        stroke="#e8eaed"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DashboardPage() {
  const { customer } = useAuth();
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    api.listDomains().then(async (list) => {
      if (cancelled) return;
      setDomains(list);

      const results = await Promise.all(
        list.map(async (d) => {
          const entries = await api.getActivity(d.id).catch(() => []);
          return { domain: d, entries };
        }),
      );
      if (cancelled) return;

      const merged = results
        .flatMap((r) => r.entries.map((e) => ({ ...e, domainId: r.domain.id, domainName: r.domain.name })))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setActivity(merged);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const firstDomain = domains && domains.length > 0 ? domains[0] : null;
  const latestActivity = activity?.[0];

  const headline = "Try Amelu Go for free";

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <div className="dashboard-columns">
          <div className="dashboard-main">
            <p className="dashboard-welcome-label">Welcome{customer?.name ? `, ${customer.name}` : ""}</p>
            <h1 className="dashboard-headline">{headline}</h1>

            <ul className="dashboard-checklist">
              <li>
                <CheckBadge />
                Access to every Amelu feature
              </li>
              <li>
                <CheckBadge />
                No credit card required
              </li>
            </ul>

            <Link to="/domains/new" className="dashboard-cta">
              Try for free
            </Link>
          </div>

          <div className="dashboard-secondary">
            <p className="dashboard-secondary-label">Quick links</p>

            <div className="dashboard-secondary-block">
              <p>Manage mailboxes across your domains.</p>
              {firstDomain && <Link to={`/domains/${firstDomain.id}/mailboxes`}>Manage mailboxes</Link>}
            </div>

            <div className="dashboard-secondary-block">
              <p>
                {latestActivity
                  ? `${latestActivity.domainName} — ${latestActivity.message}`
                  : "Activity across your domains will show up here."}
              </p>
              {firstDomain && <Link to={`/domains/${firstDomain.id}/activity`}>View all activity</Link>}
            </div>

            <div className="dashboard-secondary-block">
              <p>Need a hand? Our support team is here for you.</p>
              <Link to="/support">Contact Support</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-cards-section">

        <h2 className="dashboard-cards-heading">See what's next for your account</h2>
        <h3 className="dashboard-shelf-title">Overview</h3>

        <div className="dashboard-feature-card">
          <FeatureIllustration />
          <div className="dashboard-feature-main">
            <h4>Automate your email workflows with Amelu</h4>
            <p>
              Set up pattern rewrites, BCC captures, and spam filtering that scale with your domains. Focus on your
              business while delivery, security, and filtering are handled for you.
            </p>
            <div className="dashboard-feature-buttons">
              <Link to="/domains/new" className="button-primary">
                Add a domain
              </Link>
              {firstDomain && (
                <Link to={`/domains/${firstDomain.id}/mailboxes/new`} className="button-secondary">
                  New mailbox
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-action-grid">
          <Link to="/domains" className="action-card">
            <DomainIcon />
            <span className="action-card-main">
              <span className="action-card-title">Email Domains</span>
              <span className="action-card-subtitle">Manage your domains</span>
            </span>
          </Link>

          {firstDomain && (
            <Link to={`/domains/${firstDomain.id}/mailboxes`} className="action-card">
              <MailboxIcon />
              <span className="action-card-main">
                <span className="action-card-title">Mailboxes</span>
                <span className="action-card-subtitle">Manage mailboxes</span>
              </span>
            </Link>
          )}

          {firstDomain && (
            <Link to={`/domains/${firstDomain.id}/activity`} className="action-card">
              <ActivityIcon />
              <span className="action-card-main">
                <span className="action-card-title">Recent Activity</span>
                <span className="action-card-subtitle">View all activity</span>
              </span>
            </Link>
          )}

          <Link to="/account" className="action-card">
            <AccountIcon />
            <span className="action-card-main">
              <span className="action-card-title">My Account</span>
              <span className="action-card-subtitle">Account settings</span>
            </span>
          </Link>

          <Link to="/organization" className="action-card">
            <OrgIcon />
            <span className="action-card-main">
              <span className="action-card-title">My Organization</span>
              <span className="action-card-subtitle">Organization settings</span>
            </span>
          </Link>

          <Link to="/support" className="action-card">
            <SupportIcon />
            <span className="action-card-main">
              <span className="action-card-title">Support</span>
              <span className="action-card-subtitle">Contact our team</span>
            </span>
          </Link>
        </div>

        <div className="dashboard-section-buttons">
          <Link to="/domains" className="button-outline">
            View all domains
          </Link>
          <Link to="/account" className="button-outline">
            Account settings
          </Link>
        </div>
      </div>
    </div>
  );
}
