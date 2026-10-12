import { Domain, Invoice, Mailbox, OrganizationRole } from './api';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

export const BADGE = 'inline-flex flex-none items-center rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase';

export const TONES: Record<Tone, string> = {
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  neutral: 'bg-bg text-muted',
};

export const DOMAIN_STATUS: Record<Domain['status'], { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'ok' },
  dns_pending: { label: 'DNS pending', tone: 'warn' },
  provisioning: { label: 'Setting up', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'bad' },
  suspended: { label: 'Suspended', tone: 'bad' },
};

export const MAILBOX_STATUS: Record<Mailbox['status'], { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'ok' },
  suspended: { label: 'Suspended', tone: 'bad' },
  deleted: { label: 'Deleted', tone: 'neutral' },
};

export const INVOICE_STATUS: Record<Invoice['status'], { label: string; tone: Tone }> = {
  paid: { label: 'Paid', tone: 'ok' },
  open: { label: 'Open', tone: 'warn' },
  draft: { label: 'Draft', tone: 'neutral' },
  uncollectible: { label: 'Uncollectible', tone: 'bad' },
  void: { label: 'Void', tone: 'neutral' },
};

export function badgeClass(tone: Tone): string {
  return `${BADGE} ${TONES[tone]}`;
}

export const ROLE: Record<OrganizationRole, { label: string; tone: Tone }> = {
  owner: { label: 'Owner', tone: 'ok' },
  admin: { label: 'Admin', tone: 'ok' },
  helpdesk: { label: 'Helpdesk', tone: 'warn' },
  billing: { label: 'Billing', tone: 'warn' },
  read_only: { label: 'Read only', tone: 'neutral' },
};

export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'ok' },
  trialing: { label: 'Trialing', tone: 'warn' },
  past_due: { label: 'Past due', tone: 'bad' },
  unpaid: { label: 'Unpaid', tone: 'bad' },
  incomplete: { label: 'Incomplete', tone: 'warn' },
  incomplete_expired: { label: 'Incomplete', tone: 'neutral' },
  canceled: { label: 'Canceled', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'neutral' },
};
