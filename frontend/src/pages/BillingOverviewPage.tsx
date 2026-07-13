import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError, type BillingOverview } from "../api/client";
import { Tag } from "../components/Tag";

function formatPlanPrice(overview: BillingOverview) {
  const { plan, billingInterval } = overview;
  if (plan.priceCentsMonthly == null || plan.priceCentsAnnual == null) return "Free";

  if (billingInterval === "monthly") {
    return `$${(plan.priceCentsMonthly / 100).toFixed(0)}/mo, billed monthly`;
  }
  // Default to annual - it's what checkout defaults to, and what every
  // active paid subscription today actually uses.
  return `$${(plan.priceCentsAnnual / 1200).toFixed(0)}/mo, billed annually ($${(plan.priceCentsAnnual / 100).toFixed(0)}/yr)`;
}

export function BillingOverviewPage() {
  const [searchParams] = useSearchParams();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      setOverview(await api.getBillingOverview());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load billing info");
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const manageBilling = async () => {
    setError(null);
    setBusy(true);
    try {
      const { url } = await api.createBillingPortalSession();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open billing portal");
      setBusy(false);
    }
  };

  if (!overview) return null;

  return (
    <div>
      <h1>Billing</h1>
      <p className="introduction">Manage your plan, invoices, and payment details.</p>

      {searchParams.get("checkout") === "success" && (
        <div className="alert alert-info">
          <span>Thanks! Your subscription is now active.</span>
        </div>
      )}
      {searchParams.get("checkout") === "cancelled" && (
        <div className="alert alert-warning">
          <span>Checkout was cancelled - your plan hasn't changed.</span>
        </div>
      )}

      <div className="material-card">
        <div className="kv-table">
          <div className="kv-row">
            <span className="kv-row-label">Plan</span>
            <span>
              {overview.plan.name} <span className="light">({formatPlanPrice(overview)})</span>
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Status</span>
            <span>
              {overview.subscriptionStatus ? <Tag status={overview.subscriptionStatus} /> : <span className="light">No active subscription</span>}
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-row-label">Payment method</span>
            <span className={overview.hasPaymentMethod ? "" : "light"}>
              {overview.hasPaymentMethod ? "On file" : "None on file"}
            </span>
          </div>
        </div>
      </div>

      <div className="settings-form settings-form-wide">
        <h4>Manage Subscription</h4>
        <p className="light">
          Upgrade your plan, download invoices, and update payment details through Stripe's secure billing portal
          - opened in place, without Amelu ever handling your card details itself.
        </p>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        <div className="field-action">
          <md-filled-button type="button" onClick={manageBilling} disabled={busy}>
            Manage Billing
          </md-filled-button>
        </div>
      </div>
    </div>
  );
}
