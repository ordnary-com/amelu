import { Domain, Mailbox } from '../api';

/** One thing the search can open. */
export interface SearchResult {
  label: string;
  /** Where it is: a domain or a mailbox address, empty for account-wide pages. */
  context: string;
  hint: string;
  link: string;
  /** Lower-cased words the query is matched against. */
  words: string;
  kind: 'page' | 'domain' | 'mailbox';
}

interface PageDef {
  path: string;
  label: string;
  hint: string;
  /** Other words people type for it ("imap" for the mail app settings). */
  keywords: string;
}

// Account-wide pages.
const GLOBAL: PageDef[] = [
  { path: '/', label: 'Dashboard', hint: 'Overview of your domains and plan', keywords: 'home overview start' },
  { path: '/domains', label: 'Domains', hint: 'All your domains', keywords: 'email domains list' },
  { path: '/domains/new', label: 'Add a domain', hint: 'Connect a new domain', keywords: 'new domain create connect setup' },
  { path: '/account', label: 'My account', hint: 'Your profile and sign-in', keywords: 'profile name email login sign in' },
  { path: '/account/appearance', label: 'Appearance', hint: 'Theme and accent colour', keywords: 'theme dark light black white colour color accent mode' },
  { path: '/account/api-keys', label: 'API keys', hint: 'Personal keys for the Amelu API', keywords: 'api key token developer automation' },
  { path: '/account/terminate', label: 'Terminate account', hint: 'Close your Amelu account', keywords: 'delete account close cancel leave' },
  { path: '/organization', label: 'My organization', hint: 'Members, invitations and roles', keywords: 'team members invite users roles people' },
  { path: '/organization/activity', label: 'Activity log', hint: 'Everything that changed in your organization', keywords: 'audit history log events' },
  { path: '/organization/webmail', label: 'Webmail branding', hint: 'Your logo, name and own webmail address', keywords: 'webmail white label branding logo colour custom hostname roundcube' },
  { path: '/billing/overview', label: 'Billing', hint: 'Your plan and payment', keywords: 'billing payment subscription plan card invoice' },
  { path: '/billing/plans', label: 'Plans', hint: 'Compare and upgrade', keywords: 'plans upgrade pricing go pro free promo code discount' },
  { path: '/billing/invoices', label: 'Invoices', hint: 'Download your invoices', keywords: 'invoices receipts billing history vat' },
  { path: '/support', label: 'Support', hint: 'Get help from our team', keywords: 'help contact ticket support question' },
  { path: '/changelog', label: 'Changelog', hint: "What's new in the dashboard", keywords: 'changes new release notes updates' },
  { path: '/status', label: 'Service status', hint: 'Is everything up?', keywords: 'status outage down incident uptime' },
];

// Pages of one domain, relative to /domains/{id}.
const DOMAIN: PageDef[] = [
  { path: '', label: 'All addresses', hint: 'Mailboxes and aliases on this domain', keywords: 'overview addresses domain' },
  { path: '/activity', label: 'Recent activity', hint: 'What changed on this domain', keywords: 'activity history log' },
  { path: '/mailboxes', label: 'Mailboxes', hint: 'Every mailbox on this domain', keywords: 'mailboxes accounts users inboxes' },
  { path: '/mailboxes/new', label: 'New mailbox', hint: 'Create a mailbox', keywords: 'new mailbox create add account user' },
  { path: '/mailboxes/import', label: 'Import mailboxes', hint: 'Create many from a CSV', keywords: 'import csv bulk mailboxes' },
  { path: '/mailboxes/services', label: 'Default services', hint: 'Services new mailboxes start with', keywords: 'default services imap pop3 smtp sieve calendar contacts caldav carddav' },
  { path: '/mailboxes/limits', label: 'Default limits', hint: 'Storage caps for new mailboxes', keywords: 'default limits quota storage size' },
  { path: '/aliases', label: 'Address aliases', hint: 'Extra addresses that deliver to a mailbox', keywords: 'alias aliases forward redirect address' },
  { path: '/aliases/new', label: 'New alias', hint: 'Add an address alias', keywords: 'new alias create add address' },
  { path: '/aliases/import', label: 'Import aliases', hint: 'Create many from a CSV', keywords: 'import csv bulk aliases' },
  { path: '/domain-aliases', label: 'Domain aliases', hint: 'Other domains that deliver here', keywords: 'domain alias other domain' },
  { path: '/rewrites', label: 'Pattern rewrites', hint: 'Rules that redirect by pattern', keywords: 'rewrite pattern rule wildcard regex' },
  { path: '/catchall', label: 'Catch-all', hint: 'Mail to unknown addresses', keywords: 'catchall catch all unknown addresses' },
  { path: '/bccs', label: 'Bcc captures', hint: 'Copy mail to another address', keywords: 'bcc capture copy archive' },
  { path: '/dns', label: 'DNS configuration', hint: 'The records your domain needs', keywords: 'dns records mx spf dkim dmarc txt cname setup verify nameserver' },
  { path: '/dns/records', label: 'DNS records', hint: 'Every record, with a live check', keywords: 'dns records mx spf dkim dmarc zone file bind download srv' },
  { path: '/spam', label: 'Spam filtering', hint: 'How incoming mail is filtered', keywords: 'spam junk filter' },
  { path: '/spam/subject', label: 'Spam aggressiveness', hint: 'Subject tagging and junk rules', keywords: 'spam aggressiveness subject junk tag' },
  { path: '/spam/sender-lists', label: 'Sender lists', hint: 'Always allow or block senders', keywords: 'allowlist blocklist denylist whitelist blacklist sender block allow' },
  { path: '/spam/recipient-denylist', label: 'Recipient denylist', hint: 'Addresses that refuse mail', keywords: 'recipient denylist block refuse' },
  { path: '/transfer', label: 'Transfer domain', hint: 'Move it to another organization', keywords: 'transfer ownership move domain' },
  { path: '/deactivate', label: 'Deactivate domain', hint: 'Stop mail without deleting', keywords: 'deactivate disable pause domain' },
  { path: '/delete', label: 'Delete domain', hint: 'Remove the domain and its mail', keywords: 'delete remove domain' },
  { path: '/listing-settings', label: 'Listing settings', hint: 'Tags and sorting for this domain', keywords: 'listing tags settings' },
  { path: '/notes', label: 'Domain notes', hint: 'Notes attached to this domain', keywords: 'notes comments' },
];

// Pages of one mailbox, relative to /domains/{id}/mailboxes/{mailboxId}.
const MAILBOX: PageDef[] = [
  { path: '', label: 'Mailbox overview', hint: 'Settings at a glance', keywords: 'mailbox overview account' },
  {
    path: '/usage',
    label: 'IMAP and SMTP settings',
    hint: 'Set up mail, calendar and contacts in an app',
    keywords:
      'imap smtp pop3 server settings port host configuration configure usage instructions mail app client outlook thunderbird apple iphone android caldav carddav calendar contacts autodiscover profile',
  },
  { path: '/password', label: 'Mailbox password', hint: 'Set or reset the password', keywords: 'password reset change login credentials' },
  { path: '/services', label: 'Enabled services', hint: 'IMAP, POP3, sending, calendar and more', keywords: 'services imap pop3 smtp send receive sieve calendar contacts caldav carddav enable disable' },
  { path: '/forwarding', label: 'Forwarding', hint: 'Forward mail to another address', keywords: 'forward forwarding redirect copy' },
  { path: '/identities', label: 'Identities', hint: 'Send as other addresses', keywords: 'identity identities send as from alias' },
  { path: '/delegation', label: 'Delegation', hint: 'Let others read this mailbox', keywords: 'delegation share access shared mailbox' },
  { path: '/internal-access', label: 'Internal access', hint: 'Only mail from your own domains', keywords: 'internal access only restrict' },
  { path: '/limits', label: 'Mailbox limits', hint: 'Storage and message caps', keywords: 'limits quota storage size' },
  { path: '/expiration', label: 'Expiration', hint: 'Suspend or delete it on a date', keywords: 'expiration expire temporary date' },
  { path: '/activity', label: 'Mailbox activity', hint: 'What changed on this mailbox', keywords: 'activity history' },
  { path: '/logs', label: 'Traffic logs', hint: 'Recent mail in and out', keywords: 'logs traffic delivery received sent messages' },
  { path: '/delete', label: 'Delete mailbox', hint: 'Remove the mailbox and its mail', keywords: 'delete remove mailbox' },
];

const entry = (def: PageDef, link: string, context: string, kind: SearchResult['kind'] = 'page'): SearchResult => ({
  label: def.label,
  context,
  hint: def.hint,
  link,
  kind,
  words: `${def.label} ${def.keywords} ${context}`.toLowerCase(),
});

/** Everything searchable: the account pages, every domain's pages and the given mailboxes' pages. */
export function buildIndex(domains: Domain[], mailboxes: Map<string, Mailbox[]>): SearchResult[] {
  const out = GLOBAL.map((def) => entry(def, def.path, ''));
  for (const domain of domains) {
    const base = `/domains/${domain.id}`;
    out.push({ label: domain.name, context: '', hint: 'Domain', link: base, kind: 'domain', words: domain.name.toLowerCase() });
    out.push(...DOMAIN.map((def) => entry(def, base + def.path, domain.name)));
    for (const mailbox of mailboxes.get(domain.id) ?? []) {
      if (mailbox.status === 'deleted') continue;
      const mbase = `${base}/mailboxes/${mailbox.id}`;
      out.push({
        label: mailbox.address,
        context: mailbox.displayName ?? '',
        hint: 'Mailbox',
        link: mbase,
        kind: 'mailbox',
        words: `${mailbox.address} ${mailbox.displayName ?? ''}`.toLowerCase(),
      });
      out.push(...MAILBOX.map((def) => entry(def, mbase + def.path, mailbox.address)));
    }
  }
  return out;
}

/**
 * Results for a query: every word must appear; a label that starts with the
 * query ranks first, then a label that contains it, then keyword matches.
 * Things in the domain you're on come before the rest.
 */
export function search(index: SearchResult[], query: string, currentDomain: string | null, limit = 12): SearchResult[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: { result: SearchResult; score: number }[] = [];
  for (const result of index) {
    if (!terms.every((t) => result.words.includes(t))) continue;
    const label = result.label.toLowerCase();
    const q = terms.join(' ');
    let score = label.startsWith(q) ? 0 : label.includes(q) ? 10 : 20;
    if (result.kind !== 'page') score -= 2;
    if (currentDomain && result.link.startsWith(`/domains/${currentDomain}`)) score -= 5;
    scored.push({ result, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.result.label.length - b.result.label.length).slice(0, limit).map((s) => s.result);
}
