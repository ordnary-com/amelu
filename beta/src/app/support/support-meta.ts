import { SupportCategory, SupportStatus } from '../api';

export const SUPPORT_CATEGORIES: { id: SupportCategory; label: string }[] = [
  { id: 'delivery', label: 'Sending or receiving mail' },
  { id: 'domains', label: 'Domains and DNS' },
  { id: 'account', label: 'Account and mailboxes' },
  { id: 'billing', label: 'Billing and plans' },
  { id: 'other', label: 'Something else' },
];

export const CATEGORY_LABEL = Object.fromEntries(SUPPORT_CATEGORIES.map((c) => [c.id, c.label])) as Record<SupportCategory, string>;

/** Label, badge and dot classes per status, from the customer's side. */
export const STATUS: Record<SupportStatus, { label: string; badge: string; dot: string }> = {
  open: { label: 'Waiting for support', badge: 'bg-bg text-muted', dot: 'bg-warn' },
  answered: { label: 'Support replied', badge: 'bg-accent/12 text-link', dot: 'bg-accent' },
  closed: { label: 'Closed', badge: 'bg-bg text-muted', dot: 'bg-line' },
};

/** "just now", "5 min ago", "3 h ago", "2 days ago", or the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
