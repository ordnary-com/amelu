import { useEffect, useState } from "react";
import { api, ApiError, type Invoice } from "../api/client";
import { Tag } from "../components/Tag";
import { ListSkeleton } from "../components/ListSkeleton";

function formatDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function formatTotal(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

export function BillingInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load invoices"));
  }, []);

  return (
    <div>
      <h1>Invoices</h1>
      <p className="introduction">Every invoice issued to your account, synced directly from Stripe.</p>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="material-card">
        {invoices === null ? (
          <ListSkeleton />
        ) : invoices.length === 0 ? (
          <div className="material-empty-state">
            <p>No invoices yet.</p>
            <p className="light">Invoices will appear here automatically once your account moves to a paid plan.</p>
          </div>
        ) : (
          <md-list>
            {invoices.map((inv) => (
              <md-list-item
                key={inv.id}
                type={inv.hostedInvoiceUrl ? "link" : "text"}
                href={inv.hostedInvoiceUrl}
                target="_blank"
              >
                <div slot="headline">{inv.number || inv.id}</div>
                <div slot="end" className="domain-item-end">
                  <Tag status={inv.status} />
                  <span>{formatTotal(inv.total, inv.currency)}</span>
                  <span className="light">{formatDate(inv.createdAt)}</span>
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>
    </div>
  );
}
