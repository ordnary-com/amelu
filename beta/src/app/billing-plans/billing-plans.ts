import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of } from 'rxjs';
import { Api, BillingInterval, Plan, errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { formatPrice, isFree } from '../billing';
import { UI } from '../ui';
import { EmptyState } from '../empty-state/empty-state';
import { PromoBanner } from '../promo-banner/promo-banner';
import { Icon } from '../icon';
import { DitherShader } from '../login/dither-shader';

// Descriptive, not backend-enforced: every plan gets the same feature set
// today, only the support tier and the two API-driven limits differ. The
// shared features are listed once under the cards instead of on each one.
const SHARED = [
  'Unlimited storage per mailbox',
  'Forwarding & catch-all addresses',
  'Unlimited address & domain aliases',
  'Spam filtering & pattern rewrites',
  'DNS configuration & live health checks',
];

const PLAN_DETAILS: Record<string, { tagline: string; perks: string[] }> = {
  free: {
    tagline: 'For trying Amelu on your own domain.',
    perks: ['150 outgoing messages/day', 'Community support'],
  },
  go: {
    tagline: 'For small teams and side projects.',
    perks: ['10,000 incoming messages/day', '1,000 outgoing messages/day per domain', 'Branded webmail', 'Email support'],
  },
  pro: {
    tagline: 'For businesses that send a lot.',
    perks: ['50,000 incoming messages/day', '3,000 outgoing messages/day per domain', 'Branded webmail', 'Priority email support'],
  },
};

const CUSTOM_DETAILS = {
  tagline: 'Put together for your organization.',
  perks: ['Sending limit agreed with you', 'Branded webmail', 'Priority email support'],
};

/** The current dashboard's /billing/plans: compare, switch or cancel. */
@Component({
  selector: 'amelu-billing-plans',
  imports: [EmptyState, Alert, PromoBanner, Icon, RouterLink, DitherShader],
  templateUrl: './billing-plans.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BillingPlans {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly isFree = isFree;
  protected readonly money = formatPrice;

  // undefined while loading, null when the request failed
  protected readonly plans = toSignal(this.api.listPlans().pipe(catchError(() => of(null))));
  // Yearly first: cheaper per month, and what checkout defaults to.
  protected readonly interval = signal<BillingInterval>('annual');
  /** The campaign codes only work on a first paid subscription. */
  protected readonly onFree = () => !!this.plans()?.some((p) => p.current && isFree(p));
  protected readonly busyKey = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly shared = SHARED;

  protected details(plan: Plan): { tagline: string; perks: string[] } {
    if (plan.custom) return CUSTOM_DETAILS;
    return PLAN_DETAILS[plan.id] ?? { tagline: '', perks: [] };
  }

  /** A custom plan only has the period it was made with, whatever the toggle says. */
  protected period(plan: Plan): BillingInterval {
    if (plan.custom) return plan.priceCentsAnnual != null ? 'annual' : 'monthly';
    return this.interval();
  }

  protected price(plan: Plan): number {
    return this.period(plan) === 'monthly' ? plan.priceCentsMonthly! : plan.priceCentsAnnual!;
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
