import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { api, API_URL, type Domain } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { CsvImportHelp } from "./CsvImportHelp";

export function Layout() {
  const { customer, logout } = useAuth();
  const { domainId, mailboxId } = useParams<{ domainId: string; mailboxId: string }>();
  const location = useLocation();
  const path = location.pathname;
  const [domains, setDomains] = useState<Domain[]>([]);

  useEffect(() => {
    api.listDomains().then(setDomains);
  }, [path]);

  // exact() highlights a leaf nav item only while that specific page is
  // open; onDomains covers "Email Domains" staying bold across every page
  // nested under a domain.
  const exact = (p: string) => (path === p ? "active" : "");
  const onDomains = path.startsWith("/domains");
  const onAccount = path.startsWith("/account");
  const onBilling = path.startsWith("/billing");
  const onAllAddresses = domainId != null && path === `/domains/${domainId}`;
  const onMailboxesArea = domainId != null && path.startsWith(`/domains/${domainId}/mailboxes`);
  const onAliasesArea = domainId != null && path.startsWith(`/domains/${domainId}/aliases`);
  const onDomainAliasesArea = domainId != null && path.startsWith(`/domains/${domainId}/domain-aliases`);
  const onRewritesArea = domainId != null && path.startsWith(`/domains/${domainId}/rewrites`);
  const onBccsArea = domainId != null && path.startsWith(`/domains/${domainId}/bccs`);
  const onSpamArea = domainId != null && path.startsWith(`/domains/${domainId}/spam`);
  const onMailboxDetailArea = domainId != null && mailboxId != null && path.startsWith(`/domains/${domainId}/mailboxes/${mailboxId}`);

  return (
    <>
      <header>
        <img src="/amelu-logo.png" alt="Amelu" />
        <div className="announcement"></div>
        <nav>
          Signed in as <strong>{customer?.email}</strong>
          <span className="separator">|</span>
          <button className="submit-link signout" onClick={() => logout()}>
            Sign Out
          </button>
        </nav>
      </header>

      <main role="main">
        <div className="sidemenu-container">
          <div className="sidemenu">
            <ul>
              <li className={exact("/")}>
                <Link to="/">Dashboard</Link>
              </li>
              <li className={onDomains ? "submenu-parent active" : "submenu-parent"}>
                <Link to="/domains">Email Domains</Link>
              </li>
              {domains.map((d) => (
                <li key={d.id} className={d.id === domainId ? "submenu active" : "submenu"}>
                  <Link to={`/domains/${d.id}`}>{d.name}</Link>
                </li>
              ))}
              <li className={`submenu create ${exact("/domains/new")}`}>
                <Link to="/domains/new">New Domain</Link>
              </li>

              <li className={onAccount ? "active" : ""}>
                <Link to="/account">My Account</Link>
              </li>
              <li className={exact("/organization")}>
                <Link to="/organization">My Organization</Link>
              </li>
              <li className={onBilling ? "submenu-parent active" : "submenu-parent"}>
                <Link to="/billing/overview">Billing</Link>
              </li>

              <li className={`secondary ${exact("/changelog")}`}>
                <Link to="/changelog">Changelog</Link>
              </li>
              <li className={`secondary ${exact("/status")}`}>
                <Link to="/status">Service Status</Link>
              </li>
            </ul>
          </div>

          {domainId && (
            <div className="sidemenu">
              <ul>
                <li className={exact(`/domains/${domainId}/activity`)}>
                  <Link to={`/domains/${domainId}/activity`}>Recent Activity</Link>
                </li>
                <li className={exact(`/domains/${domainId}`)}>
                  <Link to={`/domains/${domainId}`}>All Addresses</Link>
                </li>
                {onAllAddresses && (
                  <>
                    <li className="submenu create">
                      <Link to={`/domains/${domainId}/mailboxes/new`}>New Mailbox</Link>
                    </li>
                    <li className="submenu create">
                      <Link to={`/domains/${domainId}/aliases/new`}>New Alias</Link>
                    </li>
                  </>
                )}

                <li className={onMailboxesArea ? "submenu-parent active" : "submenu-parent"}>
                  <Link to={`/domains/${domainId}/mailboxes`}>Mailboxes</Link>
                </li>
                {onMailboxesArea && (
                  <>
                    <li className={`submenu create ${exact(`/domains/${domainId}/mailboxes/new`)}`}>
                      <Link to={`/domains/${domainId}/mailboxes/new`}>New Mailbox</Link>
                    </li>
                    <li className={`submenu ${exact(`/domains/${domainId}/mailboxes/import`)}`}>
                      <Link to={`/domains/${domainId}/mailboxes/import`}>Import from CSV</Link>
                    </li>
                    <li className={`submenu ${exact(`/domains/${domainId}/mailboxes/services`)}`}>
                      <Link to={`/domains/${domainId}/mailboxes/services`}>Default Services</Link>
                    </li>
                    <li className={`submenu ${exact(`/domains/${domainId}/mailboxes/limits`)}`}>
                      <Link to={`/domains/${domainId}/mailboxes/limits`}>Default Limits</Link>
                    </li>
                    <li className="submenu">
                      <a
                        href={`${API_URL}/api/domains/${domainId}/mailboxes/export`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Export to CSV
                      </a>
                    </li>
                  </>
                )}

                <li className={onAliasesArea ? "active" : ""}>
                  <Link to={`/domains/${domainId}/aliases`}>Address Aliases</Link>
                </li>
                {onAliasesArea && (
                  <>
                    <li className={`submenu create ${exact(`/domains/${domainId}/aliases/new`)}`}>
                      <Link to={`/domains/${domainId}/aliases/new`}>New Alias</Link>
                    </li>
                    <li className={`submenu ${exact(`/domains/${domainId}/aliases/import`)}`}>
                      <Link to={`/domains/${domainId}/aliases/import`}>Import from CSV</Link>
                    </li>
                    <li className="submenu">
                      <a
                        href={`${API_URL}/api/domains/${domainId}/address-aliases/export`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Export to CSV
                      </a>
                    </li>
                  </>
                )}
                <li className={onDomainAliasesArea ? "active" : ""}>
                  <Link to={`/domains/${domainId}/domain-aliases`}>Domain Aliases</Link>
                </li>
                {onDomainAliasesArea && (
                  <li className={`submenu create ${exact(`/domains/${domainId}/domain-aliases/new`)}`}>
                    <Link to={`/domains/${domainId}/domain-aliases/new`}>New Domain Alias</Link>
                  </li>
                )}
                <li className={onRewritesArea ? "active" : ""}>
                  <Link to={`/domains/${domainId}/rewrites`}>Pattern Rewrites</Link>
                </li>
                {onRewritesArea && (
                  <li className={`submenu create ${exact(`/domains/${domainId}/rewrites/new`)}`}>
                    <Link to={`/domains/${domainId}/rewrites/new`}>New Rewrite</Link>
                  </li>
                )}
                <li className={exact(`/domains/${domainId}/catchall`)}>
                  <Link to={`/domains/${domainId}/catchall`}>Catchall Recipients</Link>
                </li>
                <li className={onBccsArea ? "active" : ""}>
                  <Link to={`/domains/${domainId}/bccs`}>Bcc. Captures</Link>
                </li>
                {onBccsArea && (
                  <li className={`submenu create ${exact(`/domains/${domainId}/bccs/new`)}`}>
                    <Link to={`/domains/${domainId}/bccs/new`}>New Capture</Link>
                  </li>
                )}

                <li className={exact(`/domains/${domainId}/dns`)}>
                  <Link to={`/domains/${domainId}/dns`}>DNS Configuration</Link>
                </li>
                <li className={onSpamArea ? "active" : ""}>
                  <Link to={`/domains/${domainId}/spam`}>Spam Filtering</Link>
                </li>

                <li className={exact(`/domains/${domainId}/transfer`)}>
                  <Link to={`/domains/${domainId}/transfer`}>Transfer Ownership...</Link>
                </li>
                <li className={exact(`/domains/${domainId}/deactivate`)}>
                  <Link to={`/domains/${domainId}/deactivate`}>Deactivate Domain...</Link>
                </li>
                <li className="delete">
                  <Link to={`/domains/${domainId}/delete`}>Delete Domain...</Link>
                </li>

                <li className={`secondary ${exact(`/domains/${domainId}/listing-settings`)}`}>
                  <Link to={`/domains/${domainId}/listing-settings`}>Listing Settings</Link>
                </li>
                <li className={`secondary ${exact(`/domains/${domainId}/notes`)}`}>
                  <Link to={`/domains/${domainId}/notes`}>Attached Notes</Link>
                </li>
              </ul>
            </div>
          )}

          {onSpamArea && (
            <div className="sidemenu">
              <ul>
                <li className={exact(`/domains/${domainId}/spam`)}>
                  <Link to={`/domains/${domainId}/spam`}>Overview</Link>
                </li>
                <li className={exact(`/domains/${domainId}/spam/subject`)}>
                  <Link to={`/domains/${domainId}/spam/subject`}>Aggressiveness</Link>
                </li>
                <li className={exact(`/domains/${domainId}/spam/sender-lists`)}>
                  <Link to={`/domains/${domainId}/spam/sender-lists`}>Sender Denylist</Link>
                </li>
                <li className={exact(`/domains/${domainId}/spam/recipient-denylist`)}>
                  <Link to={`/domains/${domainId}/spam/recipient-denylist`}>Recipient Denylist</Link>
                </li>
              </ul>
            </div>
          )}

          {onMailboxDetailArea && (
            <div className="sidemenu">
              <ul>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}`}>Overview</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/activity`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/activity`}>Recent Activity</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/logs`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/logs`}>Recent Logs</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/usage`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/usage`}>Usage Instructions</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/services`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/services`}>Enabled Services</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/limits`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/limits`}>Limits</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/password`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/password`}>Password</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/internal-access`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/internal-access`}>Internal Access</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/identities`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/identities`}>Identities</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/forwarding`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/forwarding`}>Forwarding</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/delegation`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/delegation`}>Delegation</Link>
                </li>
                <li className={exact(`/domains/${domainId}/mailboxes/${mailboxId}/expiration`)}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/expiration`}>Expiration</Link>
                </li>
                <li className="delete">
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/delete`}>Delete Mailbox...</Link>
                </li>

                <li className={`secondary ${exact(`/domains/${domainId}/mailboxes/${mailboxId}/listing-settings`)}`}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/listing-settings`}>Listing Settings</Link>
                </li>
                <li className={`secondary ${exact(`/domains/${domainId}/mailboxes/${mailboxId}/notes`)}`}>
                  <Link to={`/domains/${domainId}/mailboxes/${mailboxId}/notes`}>Attached Notes</Link>
                </li>
              </ul>
            </div>
          )}

          {onAccount && (
            <div className="sidemenu">
              <ul>
                <li className={exact("/account")}>
                  <Link to="/account">Overview</Link>
                </li>
                <li className={exact("/account/edit")}>
                  <Link to="/account/edit">General</Link>
                </li>
                <li className={exact("/account/email")}>
                  <Link to="/account/email">Email</Link>
                </li>
                <li className={exact("/account/password")}>
                  <Link to="/account/password">Password</Link>
                </li>

                <li className="disabled">
                  <span>API Keys</span>
                </li>

                <li className="delete">
                  <Link to="/account/terminate">Terminate...</Link>
                </li>
              </ul>
            </div>
          )}

          {onBilling && (
            <div className="sidemenu">
              <ul>
                <li className={exact("/billing/overview")}>
                  <Link to="/billing/overview">Overview</Link>
                </li>
                <li className={exact("/billing/plans")}>
                  <Link to="/billing/plans">Plans</Link>
                </li>
                <li className={exact("/billing/invoices")}>
                  <Link to="/billing/invoices">Invoices</Link>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="container">
          <div className={`inner-container ${path === "/" ? "inner-container-flush" : ""}`}>
            <Outlet />
          </div>

          <footer className={path === "/" ? "dashboard-footer" : ""}>
            <div className="copyright">
              Made for the world in the Netherlands{" "}
              <img src="https://flagcdn.com/w20/nl.png" width="20" height="15" alt="Netherlands flag" />
              {"  "}Copyright © 2026 Amelu, a company by Ordnary
            </div>
          </footer>
        </div>

        {domainId && path === `/domains/${domainId}/mailboxes/import` && <CsvImportHelp />}
      </main>
    </>
  );
}
