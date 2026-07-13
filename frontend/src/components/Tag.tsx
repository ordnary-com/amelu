const LABELS: Record<string, string> = {
  active: "Active",
  dns_pending: "DNS Pending",
  provisioning: "Provisioning",
  failed: "Failed",
  suspended: "Suspended",
  deleted: "Deleted",
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
};

export function Tag({ status }: { status: string }) {
  return <span className={CLASS[status] ?? "tag"}>{LABELS[status] ?? status}</span>;
}
