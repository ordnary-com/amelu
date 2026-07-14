const LABELS: Record<string, string> = {
  active: "Active",
  dns_pending: "DNS Pending",
  provisioning: "Provisioning",
  failed: "Failed",
  suspended: "Suspended",
  deleted: "Deleted",
  trialing: "Trialing",
  past_due: "Past Due",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Incomplete",
  unpaid: "Unpaid",
  paused: "Paused",
  none: "None",
  paid: "Paid",
  open: "Open",
  draft: "Draft",
  uncollectible: "Uncollectible",
  void: "Void",
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
};

// Maps our statuses onto app.css's .tag color variants (only green/orange
// are defined there; anything else falls back to the plain grey .tag, or
// pairs with the .red text-color utility for failure states).
const CLASS: Record<string, string> = {
  active: "tag green",
  dns_pending: "tag orange",
  provisioning: "tag orange",
  failed: "tag red",
  suspended: "tag",
  deleted: "tag",
  trialing: "tag orange",
  past_due: "tag red",
  canceled: "tag",
  incomplete: "tag orange",
  incomplete_expired: "tag",
  unpaid: "tag red",
  paused: "tag",
  none: "tag",
  paid: "tag green",
  open: "tag orange",
  draft: "tag",
  uncollectible: "tag red",
  void: "tag",
  operational: "tag green",
  degraded: "tag orange",
  outage: "tag red",
};

export function Tag({ status }: { status: string }) {
  return <span className={CLASS[status] ?? "tag"}>{LABELS[status] ?? status}</span>;
}
