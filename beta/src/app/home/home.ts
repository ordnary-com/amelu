import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Api } from '../api';
import { Icon } from '../icon';
import { Session } from '../session';
import { Domains } from '../domains';
import { QuickActions } from '../quick-actions/quick-actions';
import { DomainHealthChecks } from '../domain-health';
import { DomainCard } from '../domain-card/domain-card';
import { INVOICE_STATUS, badgeClass } from '../status';
import { EmptyState } from '../empty-state/empty-state';
import { DISCORD_URL, GITHUB_URL } from '../config';
import { formatPrice, isFree } from '../billing';
import { SetupChecklist } from '../setup-checklist/setup-checklist';
import { DitherShader } from '../login/dither-shader';

@Component({
  selector: 'amelu-home',
  imports: [EmptyState, Icon, DatePipe, CurrencyPipe, RouterLink, QuickActions, DomainCard, SetupChecklist, DitherShader],
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
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
  protected readonly sectionHeader = 'mb-3 flex h-6 items-center justify-between gap-3';
  protected readonly panel = 'rounded-lg border border-line bg-surface p-4';
  protected readonly cardTitle = 'flex items-center gap-2 text-[14px] font-bold';
  protected readonly headerLink = 'text-[12px] text-muted hover:text-ink hover:underline';

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
}
