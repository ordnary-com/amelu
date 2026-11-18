import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { Api, errorMessage } from '../api';
import { Domains } from '../domains';
import { Alert } from '../alert/alert';
import { INVOICE_STATUS, SUBSCRIPTION_STATUS, Tone, badgeClass } from '../status';
import { planPriceLine } from '../billing';
import { UI } from '../ui';
import { EmptyState } from '../empty-state/empty-state';
import { Icon, IconName } from '../icon';

/** The current dashboard's /billing/overview: plan, status, payment method and the Stripe portal. */
@Component({
  selector: 'amelu-billing-overview',
  imports: [EmptyState, CurrencyPipe, DatePipe, RouterLink, Alert, Icon],
  templateUrl: './billing-overview.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BillingOverview {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly badge = badgeClass;
  protected readonly subscriptionStatus = SUBSCRIPTION_STATUS;
  protected readonly invoiceStatus = INVOICE_STATUS;
  protected readonly priceLine = planPriceLine;
  protected readonly toneText: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutral: 'text-muted' };
  protected readonly toneIcon: Record<Tone, IconName> = { ok: 'circleCheck', warn: 'circleAlert', bad: 'circleX', neutral: 'clock' };
  // Label-over-value fields, as on My Account.
  protected readonly field = 'min-w-0 px-5 py-4 max-sm:not-first:border-t max-sm:not-first:border-line';
  protected readonly fieldLabel = 'text-[13px] text-muted';
  protected readonly fieldValue = 'mt-1 truncate text-[16px]';

  // undefined while loading, null when the request failed
  protected readonly overview = toSignal(this.api.billingOverview().pipe(catchError(() => of(null))));
  protected readonly invoices = toSignal(this.api.listInvoices().pipe(catchError(() => of(null))));
  protected readonly domains = inject(Domains).list;
  protected readonly checkout = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('checkout'))));

  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly domainUsage = computed(() => {
    const limit = this.overview()?.plan.maxDomains;
    const used = this.domains()?.length;
    if (limit === undefined || used === undefined) return null;
    return { used, limit, over: used > limit, percent: limit > 0 ? Math.min(100, (used / limit) * 100) : 100 };
  });

  protected async openPortal(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      const { url } = await firstValueFrom(this.api.createPortalSession());
      window.location.href = url;
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not open billing portal'));
      this.busy.set(false);
    }
  }
}
