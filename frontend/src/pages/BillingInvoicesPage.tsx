export function BillingInvoicesPage() {
  return (
    <div>
      <h1>Invoices</h1>
      <p className="introduction">Every invoice issued to your account, synced directly from Stripe.</p>

      <div className="material-card">
        <div className="material-empty-state">
          <p>No invoices yet.</p>
          <p className="light">Invoices will appear here automatically once your account moves to a paid plan.</p>
        </div>
      </div>
    </div>
  );
}
