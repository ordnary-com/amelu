import { useEffect, useState } from "react";
import { api, ApiError, type BillingInterval, type Plan } from "../api/client";

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

function cellClass(current: boolean, extra?: string) {
  return ["plan-cell", extra, current ? "plan-cell-active" : ""].filter(Boolean).join(" ");
}

// Perks below max domains/mailboxes are descriptive, not backend-enforced -
// every plan gets the same underlying feature set today, only the support
// tier and the ceilings on the two API-driven limits actually differ.
const PERKS_BY_PLAN: Record<string, { icon: string; label: string }[]> = {
  free: [
    { icon: "forward_to_inbox", label: "Forwarding & catch-all addresses" },
    { icon: "alternate_email", label: "Unlimited address & domain aliases" },
    { icon: "shield", label: "Spam filtering & pattern rewrites" },
    { icon: "dns", label: "DNS configuration & live health checks" },
    { icon: "forum", label: "Community support" },
  ],
  go: [
    { icon: "download", label: "10,000 incoming messages/day" },
    { icon: "upload", label: "2,000 outgoing messages/day" },
    { icon: "database", label: "25 GB storage per mailbox" },
    { icon: "forward_to_inbox", label: "Forwarding & catch-all addresses" },
    { icon: "alternate_email", label: "Unlimited address & domain aliases" },
    { icon: "shield", label: "Spam filtering & pattern rewrites" },
    { icon: "dns", label: "DNS configuration & live health checks" },
    { icon: "support_agent", label: "Email support" },
  ],
  pro: [
    { icon: "download", label: "50,000 incoming messages/day" },
    { icon: "upload", label: "10,000 outgoing messages/day" },
    { icon: "database", label: "100 GB storage per mailbox" },
    { icon: "forward_to_inbox", label: "Forwarding & catch-all addresses" },
    { icon: "alternate_email", label: "Unlimited address & domain aliases" },
    { icon: "shield", label: "Spam filtering & pattern rewrites" },
    { icon: "dns", label: "DNS configuration & live health checks" },
    { icon: "support_agent", label: "Priority email support" },
  ],
};

export function BillingPlansPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  useEffect(() => {
    api.listPlans().then(setPlans);
  }, []);

  const upgrade = async (planId: string, billingInterval: BillingInterval) => {
    const key = `${planId}:${billingInterval}`;
    setError(null);
    setBusyKey(key);
    try {
      const { url } = await api.createCheckoutSession(planId, billingInterval);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout");
      setBusyKey(null);
    }
  };

  const cancelPlan = async (planId: string) => {
    const key = `${planId}:cancel`;
    setError(null);
    setBusyKey(key);
    try {
      const { url } = await api.createBillingPortalSession("subscription_cancel");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open billing portal");
      setBusyKey(null);
    }
  };

  const maxPerks = plans ? Math.max(...plans.map((p) => (PERKS_BY_PLAN[p.id] ?? []).length)) : 0;

  return (
    <div>
      <h1>Plans</h1>
      <p className="introduction">Compare plans and upgrade at any time - changes are prorated automatically.</p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {plans && plans.some((p) => p.priceCentsMonthly != null) && (
        <div className="segmented-control" role="radiogroup" aria-label="Billing period">
          <label className={`segmented-option${billingInterval === "monthly" ? " segmented-option-active" : ""}`}>
            <input
              type="radio"
              name="billing-interval"
              value="monthly"
              checked={billingInterval === "monthly"}
              onChange={() => setBillingInterval("monthly")}
            />
            Monthly
          </label>
          <label className={`segmented-option${billingInterval === "annual" ? " segmented-option-active" : ""}`}>
            <input
              type="radio"
              name="billing-interval"
              value="annual"
              checked={billingInterval === "annual"}
              onChange={() => setBillingInterval("annual")}
            />
            Yearly
          </label>
        </div>
      )}

      {plans && (
        <div className="plan-table" style={{ gridTemplateColumns: `repeat(${plans.length}, 1fr)` }}>
          {plans.map((p) => {
            const isFree = p.priceCentsMonthly == null || p.priceCentsAnnual == null;
            const priceCents = billingInterval === "monthly" ? p.priceCentsMonthly : p.priceCentsAnnual;
            const savings = !isFree ? p.priceCentsMonthly! * 12 - p.priceCentsAnnual! : 0;
            const key = `${p.id}:${billingInterval}`;
            return (
              <div key={`${p.id}-header`} className={cellClass(p.current, "plan-cell-header")}>
                <div className="plan-header-info">
                  <div className="plan-header-name">
                    {p.name}
                    {p.current && <span className="light plan-current-label">Current plan</span>}
                  </div>
                  {isFree ? (
                    <div className="plan-header-price">Free</div>
                  ) : (
                    <div className="plan-header-price">
                      <strong>{formatDollars(priceCents!)}</strong> <span className="light">/{billingInterval}</span>
                      {billingInterval === "annual" && <div className="plan-price-note">Save {formatDollars(savings)}/year</div>}
                    </div>
                  )}
                </div>
                {!p.current && !isFree && (
                  <button
                    type="button"
                    className="plan-switch-button"
                    disabled={!p.purchasable || busyKey === key}
                    onClick={() => upgrade(p.id, billingInterval)}
                  >
                    Switch
                  </button>
                )}
                {p.current && !isFree && (
                  <button
                    type="button"
                    className="plan-cancel-button"
                    disabled={busyKey === `${p.id}:cancel`}
                    onClick={() => cancelPlan(p.id)}
                  >
                    Cancel plan
                  </button>
                )}
              </div>
            );
          })}

          {plans.map((p) => (
            <div key={`${p.id}-domains`} className={`${cellClass(p.current, "plan-cell-feature")} plan-feature-included`}>
              <span className="material-symbols-outlined">public</span>
              {p.maxDomains} email domain{p.maxDomains === 1 ? "" : "s"}
            </div>
          ))}

          {plans.map((p) => (
            <div key={`${p.id}-mailboxes`} className={`${cellClass(p.current, "plan-cell-feature")} plan-feature-included`}>
              <span className="material-symbols-outlined">inbox</span>
              {p.maxMailboxesPerDomain} mailboxes per domain
            </div>
          ))}

          {Array.from({ length: maxPerks }, (_, row) =>
            plans.map((p) => {
              const perk = (PERKS_BY_PLAN[p.id] ?? [])[row];
              return (
                <div
                  key={`${p.id}-perk-${row}`}
                  className={`${cellClass(p.current, "plan-cell-feature")} ${perk ? "plan-feature-included" : ""}`}
                >
                  {perk && (
                    <>
                      <span className="material-symbols-outlined">{perk.icon}</span>
                      {perk.label}
                    </>
                  )}
                </div>
              );
            }),
          )}
        </div>
      )}
    </div>
  );
}
