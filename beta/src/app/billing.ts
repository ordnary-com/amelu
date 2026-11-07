import { BillingOverview, Plan } from './api';

/** Stripe charges in euros. Whole euros without decimals: €6, €4.50. */
export function formatPrice(cents: number): string {
  const euros = cents / 100;
  return `€${Number.isInteger(euros) ? euros : euros.toFixed(2)}`;
}

/** "€9/mo, billed annually (€108/yr)", or a note that the free plan costs nothing. */
export function planPriceLine(overview: BillingOverview): string {
  const { plan, billingInterval } = overview;
  if (isFree(plan)) return 'No charge, no card needed';
  if (billingInterval === 'monthly') return `${formatPrice(plan.priceCentsMonthly!)}/mo, billed monthly`;
  // Annual is what checkout defaults to, and what active paid subscriptions use.
  return `${formatPrice(plan.priceCentsAnnual! / 12)}/mo, billed annually (${formatPrice(plan.priceCentsAnnual!)}/yr)`;
}

export function isFree(plan: Plan): boolean {
  return plan.priceCentsMonthly == null || plan.priceCentsAnnual == null;
}
