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
import { BetaBanner } from '../beta-banner/beta-banner';
import { DISCORD_URL } from '../config';

@Component({
  selector: 'amelu-home',
  imports: [EmptyState, Icon, DatePipe, CurrencyPipe, RouterLink, QuickActions, DomainCard, BetaBanner],
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
})
export class Home {
  private readonly api = inject(Api);
  private readonly session = inject(Session);

  protected readonly invoiceStatus = INVOICE_STATUS;
  protected readonly discordUrl = DISCORD_URL;
  protected readonly badge = badgeClass;

  protected readonly heroLink = 'flex items-center gap-1.5 text-[13px] font-semibold hover:text-link';
  protected readonly sectionHeader = 'mb-3 flex h-6 items-center justify-between gap-3';
  protected readonly panel = 'rounded-lg border border-line bg-surface p-4';
  protected readonly cardTitle = 'flex items-center gap-2 text-[14px] font-bold';
  protected readonly headerLink = 'text-[12px] text-muted hover:text-ink hover:underline';

  // undefined while loading, null when the request failed
  protected readonly domains = inject(Domains).arranged;
  protected readonly health = inject(DomainHealthChecks).byId;
  protected readonly billing = toSignal(this.api.billingOverview().pipe(catchError(() => of(null))));
  protected readonly invoices = toSignal(this.api.listInvoices().pipe(catchError(() => of(null))));

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
