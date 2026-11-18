import type { IconName } from '../icon';
import { DedicatedIpRequest, DedicatedIpUseCase, DedicatedIpVolume, SupportCategory, SupportStatus } from '../api';

export const SUPPORT_CATEGORIES: { id: SupportCategory; label: string; hint: string; icon: IconName }[] = [
  { id: 'delivery', label: 'Sending or receiving mail', hint: 'Bounces, spam folders, missing mail', icon: 'mail' },
  { id: 'domains', label: 'Domains and DNS', hint: 'Records, verification, nameservers', icon: 'globe' },
  { id: 'account', label: 'Account and mailboxes', hint: 'Mailboxes, passwords, your team', icon: 'user' },
  { id: 'billing', label: 'Billing and plans', hint: 'Plans, invoices, payment', icon: 'card' },
  { id: 'other', label: 'Something else', hint: 'Anything that fits nowhere else', icon: 'dots' },
];

// Dedicated IP requests come from their own form, not the topic list.
export const CATEGORY_LABEL = {
  ...Object.fromEntries(SUPPORT_CATEGORIES.map((c) => [c.id, c.label])),
  dedicated_ip: 'Dedicated IP',
} as Record<SupportCategory, string>;

export const DEDICATED_IP_VOLUMES: { id: DedicatedIpVolume; label: string }[] = [
  { id: 'lt10k', label: 'Fewer than 10,000' },
  { id: '10k-100k', label: '10,000 to 100,000' },
  { id: '100k-1m', label: '100,000 to 1 million' },
  { id: 'gt1m', label: 'More than 1 million' },
];

export const DEDICATED_IP_USE_CASES: { id: DedicatedIpUseCase; label: string; hint: string; icon: IconName }[] = [
  { id: 'transactional', label: 'Transactional', hint: 'Receipts, notifications, password resets', icon: 'mail' },
  { id: 'marketing', label: 'Newsletters', hint: 'Newsletters and marketing campaigns', icon: 'users' },
  { id: 'both', label: 'Both', hint: 'Transactional mail and newsletters', icon: 'inbox' },
];

/** Where a dedicated IP request stands, as steps for the ticket's sidebar. */
export const DEDICATED_IP_STEPS: { status: DedicatedIpRequest['status']; label: string }[] = [
  { status: 'requested', label: 'Requested' },
  { status: 'approved', label: 'Approved' },
  { status: 'paid', label: 'Paid' },
  { status: 'active', label: 'Assigned' },
];

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
