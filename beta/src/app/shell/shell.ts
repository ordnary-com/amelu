import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Domains } from '../domains';
import { Domain } from '../api';
import { DOMAIN_STATUS, Tone } from '../status';
import { AccountMenu } from '../account-menu/account-menu';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { apiUrl } from '../config';
import { TechInfo } from '../login/tech-info';
import {
  lucideBuilding2,
  lucideChevronDown,
  lucideCreditCard,
  lucideMenu,
  lucideX,
  lucideGlobe,
  lucideHistory,
  lucideMail,
  lucideHome,
  lucidePlus,
  lucideUser,
} from '@ng-icons/lucide';

// Mirrors the current dashboard's .sidemenu rules in frontend/public/app.css;
// routerLinkActive puts "active" on the <li>, which the links read via group-[.active].
// The page you're on, and the one under the pointer, in full-strength text; the others dimmed.
const LINK =
  'flex items-center gap-2 rounded-md px-2 hover:text-chrome-ink [&>ng-icon]:flex-none [&>ng-icon]:opacity-80 ' +
  'group-[.active]:text-chrome-ink group-[.active]:[&>ng-icon]:opacity-100';

@Component({
  selector: 'amelu-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AccountMenu, NgIcon, TechInfo],
  templateUrl: './shell.html',
  viewProviders: [
    provideIcons({
      lucideBuilding2,
      lucideChevronDown,
      lucideCreditCard,
      lucideMenu,
      lucideX,
      lucideGlobe,
      lucideHistory,
      lucideMail,
      lucideHome,
      lucidePlus,
      lucideUser,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-screen flex-col bg-chrome' },
})
export class Shell {
  protected readonly domains = inject(Domains).arranged;

  // The shell sits above the domain routes, so it reads ids from the URL rather than route params.
  private readonly router = inject(Router);
  protected readonly at = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => parseLocation(this.router.url)),
    ),
    { initialValue: parseLocation(this.router.url) },
  );

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly columns = computed(() => menuColumns(this.at()));

  /** The drawer that holds the menus below lg; any navigation closes it. */
  protected readonly navOpen = signal(false);
  private readonly closeNavOnNavigate = this.router.events
    .pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed())
    .subscribe(() => this.navOpen.set(false));

  // The first few domains under Domains, plus the one you're on if it's further down.
  protected readonly sidebarDomains = computed(() => {
    const all = this.domains() ?? [];
    const shown = all.slice(0, SIDEBAR_DOMAINS);
    const current = all.find((d) => d.id === this.at().domainId);
    return current && !shown.includes(current) ? [...shown, current] : shown;
  });
  /** A domain's status as a dot in the sidebar, in the tone of its badge elsewhere. */
  protected dot(domain: Domain): string {
    return DOT[DOMAIN_STATUS[domain.status].tone];
  }

  /** A column's heading: the domain's name for the domain menu, else the menu's own label. */
  protected columnTitle(menu: { key: string; label: string }): string {
    if (menu.key !== 'domain') return menu.label;
    return this.domains()?.find((d) => d.id === this.at().domainId)?.name ?? menu.label;
  }

  protected readonly hiddenDomains = computed(() => (this.domains()?.length ?? 0) - SIDEBAR_DOMAINS);

  // Each menu column scrolls on its own, so a long domain menu doesn't drag the main one along.
  protected readonly column =
    'flex-none overflow-y-auto pb-4 max-lg:overflow-visible max-lg:pb-0 [scrollbar-color:color-mix(in_srgb,var(--chrome-ink)_30%,transparent)_transparent] [scrollbar-width:thin]';

  // Labels land where the old px-4 put them: 8px margin + 8px link padding.
  protected readonly item = 'group mx-2 truncate [&>a]:py-2';
  // A thin guide line under the parent's icon instead of the old 5px bar; the
  // active child lights up its own stretch of it.
  protected readonly subitem =
    'group mr-2 ml-[22px] truncate border-l-2 border-chrome-ink/20 py-0.5 pl-1.5 [&>a]:py-1.5 [&.active]:border-chrome-ink/80';
  protected readonly link = `text-chrome-ink/65 ${LINK}`;
  protected readonly dangerLink = `text-bad ${LINK}`;
  protected readonly secondaryLink = `text-chrome-ink/50 ${LINK}`;
  // New Domain, New Mailbox and the like: ordinary links, told apart by their plus.
  protected readonly createLink = `text-chrome-ink/65 ${LINK}`;

  // A category with pages under it: its link ends in a chevron, and clicking it unfolds them.
  protected readonly category = 'group mx-2 truncate [&>a]:py-2';

  /** Folded categories, remembered in this browser. Domains starts open, the rest folded. */
  protected readonly collapsed = signal<Record<SidebarCategory, boolean>>(readCollapsed());

  /** A category's pages show when it's unfolded, or when you're on one of them. */
  protected open(key: SidebarCategory): boolean {
    if (!this.collapsed()[key]) return true;
    return key === 'organization' && this.url().startsWith('/organization/');
  }

  /** Clicking a category opens its page and unfolds it; clicking it again on that page folds it. */
  protected categoryClick(key: SidebarCategory): void {
    const page = key === 'domains' ? '/domains' : '/organization';
    this.setCollapsed(key, this.url() === page && this.open(key));
  }

  private setCollapsed(key: SidebarCategory, collapsed: boolean): void {
    this.collapsed.update((state) => ({ ...state, [key]: collapsed }));
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(this.collapsed()));
    } catch {
      // Blocked storage: it just won't be remembered.
    }
  }
}

type SidebarCategory = 'domains' | 'organization';
const COLLAPSED_KEY = 'amelu-sidebar-collapsed';

function readCollapsed(): Record<SidebarCategory, boolean> {
  try {
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}');
    return { domains: stored.domains === true, organization: stored.organization !== false };
  } catch {
    return { domains: false, organization: true };
  }
}

const SIDEBAR_DOMAINS = 3;

const DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-chrome-ink/40',
};

interface MenuEntry {
  label: string;
  link: string;
  /** Indented under the entry above it, as the current dashboard's submenus. */
  sub?: boolean;
  /** Stays lit on the pages below it too. */
  area?: boolean;
  kind?: 'create' | 'danger' | 'download';
  /** Muted, for the rarely used settings at the end. */
  secondary?: boolean;
  /** Starts a new group: a thin line above it. */
  divider?: boolean;
}

interface MenuColumn {
  key: string;
  label: string;
  items: MenuEntry[];
}

type Location = ReturnType<typeof parseLocation>;

/** The extra menu columns for where you are, in the order and wording of the current dashboard. */
function menuColumns({ domainId, section, mailboxId }: Location): MenuColumn[] {
  if (!domainId) return [];
  const d = `/domains/${domainId}`;
  const columns: MenuColumn[] = [];
  const domain: MenuEntry[] = [
    { label: 'Recent Activity', link: `${d}/activity` },
    { label: 'All Addresses', link: d },
  ];
  if (!section) {
    domain.push(
      { label: 'New Mailbox', link: `${d}/mailboxes/new`, sub: true, kind: 'create' },
      { label: 'New Alias', link: `${d}/aliases/new`, sub: true, kind: 'create' },
    );
  }
  domain.push({ label: 'Mailboxes', link: `${d}/mailboxes`, area: true });
  if (section === 'mailboxes') {
    domain.push(
      { label: 'New Mailbox', link: `${d}/mailboxes/new`, sub: true, kind: 'create' },
      { label: 'Import from CSV', link: `${d}/mailboxes/import`, sub: true },
      { label: 'Default Services', link: `${d}/mailboxes/services`, sub: true },
      { label: 'Default Limits', link: `${d}/mailboxes/limits`, sub: true },
      { label: 'Export to CSV', link: apiUrl(`/api${d}/mailboxes/export`), sub: true, kind: 'download' },
    );
  }
  domain.push({ label: 'Address Aliases', link: `${d}/aliases`, area: true });
  if (section === 'aliases') {
    domain.push(
      { label: 'New Alias', link: `${d}/aliases/new`, sub: true, kind: 'create' },
      { label: 'Import from CSV', link: `${d}/aliases/import`, sub: true },
      { label: 'Export to CSV', link: apiUrl(`/api${d}/address-aliases/export`), sub: true, kind: 'download' },
    );
  }
  domain.push({ label: 'Domain Aliases', link: `${d}/domain-aliases`, area: true });
  if (section === 'domain-aliases') {
    domain.push({ label: 'New Domain Alias', link: `${d}/domain-aliases/new`, sub: true, kind: 'create' });
  }
  domain.push({ label: 'Pattern Rewrites', link: `${d}/rewrites`, area: true });
  if (section === 'rewrites') {
    domain.push({ label: 'New Rewrite', link: `${d}/rewrites/new`, sub: true, kind: 'create' });
  }
  domain.push(
    { label: 'Catchall Recipients', link: `${d}/catchall`, divider: true },
    { label: 'Bcc. Captures', link: `${d}/bccs`, area: true },
  );
  if (section === 'bccs') {
    domain.push({ label: 'New Capture', link: `${d}/bccs/new`, sub: true, kind: 'create' });
  }
  domain.push(
    { label: 'DNS Configuration', link: `${d}/dns`, area: true, divider: true },
    { label: 'Spam Filtering', link: `${d}/spam`, area: true },
    { label: 'Transfer Ownership...', link: `${d}/transfer`, divider: true },
    { label: 'Deactivate Domain...', link: `${d}/deactivate` },
    { label: 'Delete Domain...', link: `${d}/delete`, kind: 'danger' },
    { label: 'Listing Settings', link: `${d}/listing-settings`, secondary: true, divider: true },
    { label: 'Attached Notes', link: `${d}/notes`, secondary: true },
  );
  columns.push({ key: 'domain', label: 'Domain', items: domain });

  // DNS and Spam filtering have no column of their own: their pages are tabs on the page (section-tabs.ts).
  if (mailboxId) {
    const m = `${d}/mailboxes/${mailboxId}`;
    columns.push({
      key: 'mailbox:' + mailboxId,
      label: 'Mailbox',
      items: [
        { label: 'Overview', link: m },
        { label: 'Recent Activity', link: `${m}/activity` },
        { label: 'Recent Logs', link: `${m}/logs` },
        { label: 'Usage Instructions', link: `${m}/usage` },
        { label: 'Enabled Services', link: `${m}/services` },
        { label: 'Limits', link: `${m}/limits` },
        { label: 'Password', link: `${m}/password`, divider: true },
        { label: 'Internal Access', link: `${m}/internal-access` },
        { label: 'Identities', link: `${m}/identities`, divider: true },
        { label: 'Forwarding', link: `${m}/forwarding` },
        { label: 'Delegation', link: `${m}/delegation` },
        { label: 'Expiration', link: `${m}/expiration` },
        { label: 'Delete Mailbox...', link: `${m}/delete`, kind: 'danger', divider: true },
        { label: 'Listing Settings', link: `${m}/listing-settings`, secondary: true, divider: true },
        { label: 'Attached Notes', link: `${m}/notes`, secondary: true },
      ],
    });
  }
  return columns;
}

// Paths under mailboxes/ that are domain pages, not a mailbox id.
const MAILBOX_DOMAIN_PAGES = new Set(['new', 'import', 'services', 'limits']);

function parseLocation(url: string): { domainId: string | null; section: string | null; mailboxId: string | null } {
  const [, domainId, section, sub] = /^\/domains\/([^/?#]+)(?:\/([^/?#]+))?(?:\/([^/?#]+))?/.exec(url) ?? [];
  if (!domainId || domainId === 'new') return { domainId: null, section: null, mailboxId: null };
  const mailboxId = section === 'mailboxes' && sub && !MAILBOX_DOMAIN_PAGES.has(sub) ? sub : null;
  return { domainId, section: section ?? null, mailboxId };
}
