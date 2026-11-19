import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, map, of, startWith, switchMap, tap } from 'rxjs';
import { injectDomain } from '../domain-context';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { Icon } from '../icon';
import { Session } from '../session';
import { UI } from '../ui';
import { DEDICATED_IP_STATE, TONE_ICON, TONE_TEXT, Tone, badgeClass } from '../status';
import { DomainAction, DomainAdminApi, DomainStatus } from './domain-admin-api';

/** Something wrong with the domain, as a block in the top panel. */
interface Problem {
  key: 'sending' | 'domain' | 'account';
  tone: Tone;
  title: string;
}

/** One line in the overview under the top panel's headline. */
interface Row {
  label: string;
  tone: Tone;
  value: string;
  detail: string;
  link?: { label: string; to: string };
}

const DOMAIN_STATE: Record<DomainStatus['domain']['status'], { tone: Tone; value: string; detail: string }> = {
  active: { tone: 'ok', value: 'Active', detail: 'Set up and receiving mail' },
  dns_pending: { tone: 'warn', value: 'DNS pending', detail: 'Waiting for the DNS records to be in place' },
  provisioning: { tone: 'neutral', value: 'Setting up', detail: 'Being added to the mail server' },
  unverified: { tone: 'warn', value: 'Not verified', detail: 'Prove you own the domain first' },
  failed: { tone: 'bad', value: 'Setup failed', detail: "The domain couldn't be added to the mail server" },
  suspended: { tone: 'bad', value: 'Deactivated', detail: 'Mail to and from this domain is stopped' },
};

const KIND: Record<DomainAction['kind'], string> = { sending_paused: 'Sending paused', notice: 'Notice' };
const SOURCE: Record<DomainAction['source'], string> = { sender_guard: 'By our abuse protection', staff: 'By Amelu staff' };

@Component({
  selector: 'amelu-domain-status',
  imports: [PageHeader, EmptyState, DatePipe, RouterLink, Icon],
  templateUrl: './domain-status.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DomainStatusPage {
  private readonly api = inject(DomainAdminApi);
  private readonly session = inject(Session);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly toneText = TONE_TEXT;
  protected readonly toneIcon = TONE_ICON;
  protected readonly kind = KIND;
  protected readonly source = SOURCE;
  protected readonly badge = badgeClass;
  protected readonly abuseMail = 'mailto:abuse@amelu.org';

  private readonly reload$ = new BehaviorSubject<void>(undefined);
  protected readonly checking = signal(false);
  protected readonly checkedAt = signal<Date | null>(null);

  // undefined while loading, null when the request failed. Check again keeps
  // the last result on screen until the new one is in.
  protected readonly status = toSignal(
    toObservable(this.ctx.id).pipe(
      switchMap((id) =>
        this.reload$.pipe(
          tap(() => this.checking.set(true)),
          switchMap(() =>
            this.api.status(id).pipe(
              map((s): DomainStatus | null => s),
              catchError(() => of(null)),
            ),
          ),
          tap(() => {
            this.checking.set(false);
            this.checkedAt.set(new Date());
          }),
          startWith(undefined),
        ),
      ),
    ),
    { initialValue: undefined },
  );

  // The API's rule for domain changes (authz.CanManageDomains).
  protected readonly canRequest = computed(() => ['owner', 'admin'].includes(this.session.customer()?.role ?? ''));

  /** An unverified domain isn't on the mail server, so there's nothing to check yet. */
  protected readonly unverified = computed(() => this.ctx.domain()?.status === 'unverified');

  protected readonly problems = computed((): Problem[] => {
    const s = this.status();
    if (!s) return [];
    const out: Problem[] = [];
    if (s.account.suspended) out.push({ key: 'account', tone: 'bad', title: 'The account is suspended' });
    if (s.sending.state === 'paused') out.push({ key: 'sending', tone: 'bad', title: 'Sending is paused' });
    if (s.domain.status === 'suspended') out.push({ key: 'domain', tone: 'bad', title: 'This domain is deactivated' });
    if (s.domain.status === 'failed') out.push({ key: 'domain', tone: 'bad', title: "This domain's setup didn't finish" });
    return out;
  });

  protected readonly rows = computed((): Row[] => {
    const s = this.status();
    if (!s) return [];
    const id = this.ctx.id();
    const paused = s.sending.pausedMailboxes.length;
    const sending: Row =
      s.sending.state === 'ok'
        ? { label: 'Sending', tone: 'ok', value: 'Normal', detail: 'Every mailbox can send' }
        : s.sending.state === 'paused'
          ? { label: 'Sending', tone: 'bad', value: 'Paused', detail: `${paused} ${paused === 1 ? 'mailbox' : 'mailboxes'} can't send` }
          : { label: 'Sending', tone: 'warn', value: "Couldn't check", detail: "The mail server didn't answer. Try again in a minute." };

    const state = DOMAIN_STATE[s.domain.status];
    const domain: Row = { label: 'Domain', ...state };
    if (s.domain.status === 'dns_pending') domain.link = { label: 'DNS', to: `/domains/${id}/dns` };
    if (s.domain.status === 'suspended') domain.link = { label: 'Reactivate', to: `/domains/${id}/deactivate` };

    const account: Row = s.account.suspended
      ? { label: 'Account', tone: 'bad', value: 'Suspended', detail: 'The dashboard and API are blocked for its owner' }
      : { label: 'Account', tone: 'ok', value: 'In good standing', detail: 'No action on the account' };

    const { sent, limit, updatedAt } = s.dailyLimit;
    const ratio = limit > 0 ? sent / limit : 0;
    const daily: Row =
      limit <= 0
        ? { label: 'Daily limit', tone: 'ok', value: 'No limit', detail: 'Your plan has no daily cap' }
        : {
            label: 'Daily limit',
            tone: ratio >= 1 ? 'warn' : 'ok',
            value: `${sent.toLocaleString('en-GB')} of ${limit.toLocaleString('en-GB')}`,
            detail: !updatedAt
              ? 'No count yet'
              : ratio >= 1
                ? 'Reached: new mail waits in the queue until there is room'
                : 'Sent in the last 24 hours',
          };
    if (limit > 0) daily.link = { label: 'Plans', to: '/billing/plans' };

    const ip = s.dedicatedIps[0];
    const dedicated: Row = ip
      ? {
          label: 'Dedicated IP',
          tone: DEDICATED_IP_STATE[ip.state].tone,
          value: s.dedicatedIps.map((d) => d.ip).join(', '),
          detail: `${DEDICATED_IP_STATE[ip.state].label}, as ${ip.hostname}`,
          link: { label: 'Details', to: '/organization/dedicated-ips' },
        }
      : {
          label: 'Dedicated IP',
          tone: 'neutral',
          value: 'Shared IPs',
          detail: 'Mail goes out from our shared sending addresses',
          link: { label: 'Learn more', to: '/organization/dedicated-ips' },
        };
    return [sending, domain, account, daily, dedicated];
  });

  /** The headline when nothing is wrong: all good, or all good as far as we could check. */
  protected readonly unchecked = computed(() => this.status()?.sending.state === 'unknown');

  protected reload(): void {
    this.reload$.next();
  }
}
