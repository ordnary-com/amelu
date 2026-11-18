import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Api, Domain } from '../api';
import { Icon, IconName } from '../icon';
import { Session } from '../session';
import { Domains } from '../domains';
import { QuickActions } from '../quick-actions/quick-actions';
import { DomainHealthChecks, healthScore } from '../domain-health';
import { DEDICATED_IP_STATE, DOMAIN_STATUS, INVOICE_STATUS, Tone, badgeClass } from '../status';
import { EmptyState } from '../empty-state/empty-state';
import { DISCORD_URL, GITHUB_URL } from '../config';
import { formatPrice, isFree } from '../billing';
import { DitherShader } from '../login/dither-shader';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { UI } from '../ui';

@Component({
  selector: 'amelu-home',
  imports: [EmptyState, Icon, DatePipe, CurrencyPipe, DecimalPipe, RouterLink, QuickActions, DitherShader, HlmTooltipImports],
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5' },
})
export class Home {
  private readonly api = inject(Api);
  private readonly session = inject(Session);

  protected readonly invoiceStatus = INVOICE_STATUS;
  protected readonly discordUrl = DISCORD_URL;
  protected readonly githubUrl = GITHUB_URL;
  protected readonly badge = badgeClass;

  protected readonly heroLink = 'inline-flex items-center gap-1 px-3 first:pl-0 last:pr-0 hover:text-ink hover:underline underline-offset-4';
  protected readonly today = new Date();
  protected readonly greeting = computed(() => {
    const hour = this.today.getHours();
    return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  });
  protected readonly ui = UI;
  protected readonly domainStatus = DOMAIN_STATUS;
  protected readonly toneText: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutral: 'text-muted' };

  // Flat panels with a title bar, boxed figures and bordered tables.
  protected readonly panel = 'overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.05)]';
  protected readonly panelHeader = 'flex h-11 items-center justify-between gap-3 border-b border-line px-4';
  protected readonly panelTitle = 'text-[15px] font-medium';
  protected readonly arrow = '-mr-1.5 inline-flex size-7 flex-none items-center justify-center rounded-md text-ink hover:bg-bg';
  protected readonly stat = 'flex items-center justify-between gap-4 rounded-md border border-line bg-surface px-4 py-3 text-[13px]';
  protected readonly statValue = 'flex-none text-[24px] leading-none font-normal tabular-nums';
  // A panel's grey body, under white tables and figures.
  protected readonly tableBody = 'bg-well p-4';
  protected readonly toneIcon: Record<Tone, IconName> = { ok: 'circleCheck', warn: 'circleAlert', bad: 'circleX', neutral: 'clock' };

  protected readonly domainColumns: { key: DomainSort; label: string }[] = [
    { key: 'name', label: 'Name / ID' },
    { key: 'status', label: 'Status' },
    { key: 'dns', label: 'DNS records' },
    { key: 'added', label: 'Added' },
  ];
  /** null keeps the order from Domains (favorites first, then your listing settings). */
  protected readonly sort = signal<{ key: DomainSort | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  protected readonly sortedDomains = computed(() => {
    const list = [...(this.domains() ?? [])];
    const { key, dir } = this.sort();
    if (!key) return list;
    const health = this.health();
    const value = (d: Domain): string | number =>
      key === 'name' ? d.name : key === 'status' ? DOMAIN_STATUS[d.status].label : key === 'added' ? d.createdAt : (healthScore(health?.[d.id]) ?? -1);
    return list.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  });

  protected sortBy(key: DomainSort): void {
    this.sort.update((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  protected readonly copied = signal<string | null>(null);
  protected async copy(id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(id);
      this.copied.set(id);
      setTimeout(() => this.copied.set(null), 1500);
    } catch {
      // No clipboard access (insecure origin or denied): nothing to show.
    }
  }

  // undefined while loading, null when the request failed
  protected readonly domains = inject(Domains).arranged;
  protected readonly health = inject(DomainHealthChecks).byId;
  protected readonly billing = toSignal(this.api.billingOverview().pipe(catchError(() => of(null))));
  protected readonly invoices = toSignal(this.api.listInvoices().pipe(catchError(() => of(null))));
  protected readonly dedicatedIps = toSignal(this.api.organizationDedicatedIps().pipe(catchError(() => of(null))));
  protected readonly ipState = DEDICATED_IP_STATE;
  private readonly plans = toSignal(this.api.listPlans().pipe(catchError(() => of(null))));
  /** On the free plan: what Go adds, from the live plan limits. */
  protected readonly upgrade = computed(() => {
    const current = this.billing()?.plan;
    const go = this.plans()?.find((p) => p.id === 'go');
    if (!current || !isFree(current) || !go?.priceCentsAnnual) return null;
    return {
      perMonth: formatPrice(go.priceCentsAnnual / 12),
      domains: go.maxDomains,
      mailboxes: go.maxMailboxesPerDomain,
      lines: [
        `${go.maxDomains} domains instead of ${current.maxDomains}`,
        `${go.maxMailboxesPerDomain} mailboxes per domain instead of ${current.maxMailboxesPerDomain}`,
        '1,000 outgoing messages a day instead of 150',
        'Branded webmail and email support',
      ],
    };
  });

  protected readonly firstName = computed(() => {
    const customer = this.session.customer();
    // The name comes from Ordnary on every sign-in; first_name can be a stale
    // leftover from the old signup form.
    return customer?.name?.split(' ')[0] || '';
  });

  protected readonly domainUsage = computed(() => {
    const limit = this.billing()?.plan.maxDomains;
    const used = this.domains()?.length;
    if (limit === undefined || used === undefined) return null;
    return { used, limit, over: used > limit, percent: limit > 0 ? Math.min(100, (used / limit) * 100) : 100 };
  });

  protected readonly latestInvoice = computed(() => this.invoices()?.[0] ?? null);

  /** One line under the greeting on how the domains are doing, and where to go if one needs you. */
  protected readonly summary = computed((): { text: string; link?: string; linkLabel?: string } => {
    const list = this.domains();
    if (!list) return { text: "Here's how your mail is doing." };
    if (list.length === 0) return { text: 'Add a domain to start receiving mail with Amelu.', link: '/domains/new', linkLabel: 'Add a domain' };
    const health = this.health();
    const attention = list.filter((d) => {
      const check = health?.[d.id];
      return d.status !== 'active' || (!!check && check.total > 0 && check.matched < check.total);
    });
    if (attention.length === 0) {
      return { text: list.length === 1 ? `${list[0].name} is set up and receiving mail.` : `All ${list.length} of your domains are set up and receiving mail.` };
    }
    if (attention.length === 1) {
      return { text: `${attention[0].name} needs your attention.`, link: `/domains/${attention[0].id}`, linkLabel: 'Take a look' };
    }
    return { text: `${attention.length} of your ${list.length} domains need your attention.`, link: '/domains', linkLabel: 'See which' };
  });

  /** "No charge", or how the subscription is billed. */
  protected readonly planBilling = computed(() => {
    const overview = this.billing();
    if (!overview) return '';
    if (isFree(overview.plan)) return 'No charge';
    return overview.billingInterval === 'annual' ? 'Billed yearly' : overview.billingInterval === 'monthly' ? 'Billed monthly' : 'Active';
  });

  // The daily sending limit per domain for each plan (the API's plan tiers).
  private readonly sendingLimits: Record<string, number> = { free: 150, go: 1000, pro: 3000 };
  protected readonly sendingLimit = computed(() => {
    const id = this.billing()?.plan.id;
    return id ? (this.sendingLimits[id] ?? null) : null;
  });
}

type DomainSort = 'name' | 'status' | 'dns' | 'added';
