import type { IconName } from '../icon';
import { SupportCategory, SupportStatus } from '../api';

export const SUPPORT_CATEGORIES: { id: SupportCategory; label: string; hint: string; icon: IconName }[] = [
  { id: 'delivery', label: 'Sending or receiving mail', hint: 'Bounces, spam folders, missing mail', icon: 'mail' },
  { id: 'domains', label: 'Domains and DNS', hint: 'Records, verification, nameservers', icon: 'globe' },
  { id: 'account', label: 'Account and mailboxes', hint: 'Mailboxes, passwords, your team', icon: 'user' },
  { id: 'billing', label: 'Billing and plans', hint: 'Plans, invoices, payment', icon: 'card' },
  { id: 'other', label: 'Something else', hint: 'Anything that fits nowhere else', icon: 'dots' },
];

export const CATEGORY_LABEL = Object.fromEntries(SUPPORT_CATEGORIES.map((c) => [c.id, c.label])) as Record<SupportCategory, string>;

/** Label, badge, dot, and icon with text colour (tables) per status, from the customer's side. */
export const STATUS: Record<SupportStatus, { label: string; badge: string; dot: string; icon: IconName; text: string }> = {
  open: { label: 'Waiting for support', badge: 'bg-bg text-muted', dot: 'bg-warn', icon: 'clock', text: 'text-warn' },
  answered: { label: 'Support replied', badge: 'bg-accent/12 text-link', dot: 'bg-accent', icon: 'mail', text: 'text-link' },
  closed: { label: 'Closed', badge: 'bg-bg text-muted', dot: 'bg-line', icon: 'circleCheck', text: 'text-muted' },
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
