import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of } from 'rxjs';
import { Api, BillingInterval, Plan, errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { formatDollars, isFree } from '../billing';
import { UI } from '../ui';
import { EmptyState } from '../empty-state/empty-state';

// Descriptive, not backend-enforced: every plan gets the same feature set
// today, only the support tier and the two API-driven limits differ.
// Copied from frontend/src/pages/BillingPlansPage.tsx.
const PERKS_BY_PLAN: Record<string, string[]> = {
  free: [
    'Forwarding & catch-all addresses',
    'Unlimited address & domain aliases',
    'Spam filtering & pattern rewrites',
    'DNS configuration & live health checks',
    'Community support',
  ],
  go: [
    '10,000 incoming messages/day',
    '2,000 outgoing messages/day',
    '25 GB storage per mailbox',
    'Forwarding & catch-all addresses',
    'Unlimited address & domain aliases',
    'Spam filtering & pattern rewrites',
    'DNS configuration & live health checks',
    'Email support',
  ],
  pro: [
    '50,000 incoming messages/day',
    '10,000 outgoing messages/day',
    '100 GB storage per mailbox',
    'Forwarding & catch-all addresses',
    'Unlimited address & domain aliases',
    'Spam filtering & pattern rewrites',
    'DNS configuration & live health checks',
    'Priority email support',
  ],
};

/** The current dashboard's /billing/plans: compare, switch or cancel. */
@Component({
  selector: 'amelu-billing-plans',
  imports: [EmptyState, Alert],
  templateUrl: './billing-plans.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BillingPlans {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly isFree = isFree;
  protected readonly dollars = formatDollars;

  // undefined while loading, null when the request failed
  protected readonly plans = toSignal(this.api.listPlans().pipe(catchError(() => of(null))));
  protected readonly interval = signal<BillingInterval>('monthly');
  protected readonly busyKey = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected perks(plan: Plan): string[] {
    return PERKS_BY_PLAN[plan.id] ?? [];
  }

  protected price(plan: Plan): number {
    return this.interval() === 'monthly' ? plan.priceCentsMonthly! : plan.priceCentsAnnual!;
  }

  protected savings(plan: Plan): number {
    return plan.priceCentsMonthly! * 12 - plan.priceCentsAnnual!;
  }

  protected hasPaidPlans(plans: Plan[]): boolean {
    return plans.some((plan) => !isFree(plan));
  }

  protected async switchTo(plan: Plan): Promise<void> {
    const interval = this.interval();
    this.error.set(null);
    this.busyKey.set(`${plan.id}:${interval}`);
    try {
      const { url } = await firstValueFrom(this.api.createCheckout(plan.id, interval));
      window.location.href = url;
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not start checkout'));
      this.busyKey.set(null);
    }
  }

  protected async cancel(plan: Plan): Promise<void> {
    this.error.set(null);
    this.busyKey.set(`${plan.id}:cancel`);
    try {
      const { url } = await firstValueFrom(this.api.createPortalSession('subscription_cancel'));
      window.location.href = url;
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not open billing portal'));
      this.busyKey.set(null);
    }
  }
}
