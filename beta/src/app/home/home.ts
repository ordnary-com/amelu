import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Api } from '../api';
import { Icon } from '../icon';
import { Session } from '../session';
import { Domains } from '../domains';
import { QuickActions } from '../quick-actions/quick-actions';
import { DomainHealthChecks } from '../domain-health';
import { DOMAIN_STATUS, INVOICE_STATUS, Tone, badgeClass } from '../status';
import { EmptyState } from '../empty-state/empty-state';
import { DISCORD_URL, GITHUB_URL } from '../config';
import { formatPrice, isFree } from '../billing';
import { SetupChecklist } from '../setup-checklist/setup-checklist';
import { DitherShader } from '../login/dither-shader';
import { UI } from '../ui';

@Component({
  selector: 'amelu-home',
  imports: [EmptyState, Icon, DatePipe, CurrencyPipe, DecimalPipe, RouterLink, QuickActions, SetupChecklist, DitherShader],
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

  protected readonly heroLink = 'flex items-center gap-1.5 text-[13px] font-semibold hover:text-link';
  protected readonly today = new Date();
  protected readonly greeting = computed(() => {
    const hour = this.today.getHours();
    return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  });
  protected readonly ui = UI;
  protected readonly domainStatus = DOMAIN_STATUS;
  protected readonly toneText: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutral: 'text-muted' };

  // Flat panels with a title bar, boxed figures and bordered tables.
  protected readonly panel = 'overflow-hidden rounded-md border border-line bg-surface';
  protected readonly panelHeader = 'flex min-h-14 items-center justify-between gap-3 border-b border-line px-5 py-3';
  protected readonly panelTitle = 'text-[17px] font-medium';
  protected readonly arrow = 'inline-flex size-8 flex-none items-center justify-center rounded-md text-ink hover:bg-bg';
  protected readonly stat = 'flex items-center justify-between gap-4 rounded-md border border-line px-5 py-4 text-[14px]';
  protected readonly statValue = 'flex-none text-[28px] leading-none font-normal tabular-nums';
  protected readonly th = 'px-5 py-3 font-medium whitespace-nowrap';
  protected readonly td = 'px-5 py-3.5 align-middle';

  // undefined while loading, null when the request failed
  protected readonly domains = inject(Domains).arranged;
  protected readonly health = inject(DomainHealthChecks).byId;
  protected readonly billing = toSignal(this.api.billingOverview().pipe(catchError(() => of(null))));
  protected readonly invoices = toSignal(this.api.listInvoices().pipe(catchError(() => of(null))));
  private readonly plans = toSignal(this.api.listPlans().pipe(catchError(() => of(null))));
  /** On the free plan: what Go adds, from the live plan limits. */
  protected readonly upgrade = computed(() => {
    const current = this.billing()?.plan;
    const go = this.plans()?.find((p) => p.id === 'go');
    if (!current || !isFree(current) || !go?.priceCentsAnnual) return null;
    return {
      perMonth: formatPrice(go.priceCentsAnnual / 12),
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
