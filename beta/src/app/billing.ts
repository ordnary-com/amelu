import { BillingOverview, Plan } from './api';

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

/** "$9/mo, billed annually ($108/yr)", or a note that the free plan costs nothing. */
export function planPriceLine(overview: BillingOverview): string {
  const { plan, billingInterval } = overview;
  if (isFree(plan)) return 'No charge, no card needed';
  if (billingInterval === 'monthly') return `${formatDollars(plan.priceCentsMonthly!)}/mo, billed monthly`;
  // Annual is what checkout defaults to, and what active paid subscriptions use.
  return `${formatDollars(plan.priceCentsAnnual! / 12)}/mo, billed annually (${formatDollars(plan.priceCentsAnnual!)}/yr)`;
}

export function isFree(plan: Plan): boolean {
  return plan.priceCentsMonthly == null || plan.priceCentsAnnual == null;
}
