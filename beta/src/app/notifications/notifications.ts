import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, forkJoin, map, of, switchMap } from 'rxjs';
import { Api, Domain } from '../api';
import { Domains } from '../domains';
import { DomainHealthChecks, needsAttention } from '../domain-health';
import { MailboxesApi } from '../mailboxes/mailboxes-api';

export interface Notice {
  /** Stable per situation, so a read notice stays read until something changes. */
  id: string;
  tone: 'warn' | 'bad';
  title: string;
  text: string;
  link: string;
}

const READ_KEY = 'amelu.notices.read';
// Each domain costs a request per source, so only the first ones are checked.
const SENDING_DOMAINS = 10;
const STORAGE_DOMAINS = 5;
const NEAR = 0.85;

/** What needs attention across the account, worked out from what the dashboard already loads. */
@Injectable({ providedIn: 'root' })
export class Notifications {
  private readonly api = inject(Api);
  private readonly mailboxesApi = inject(MailboxesApi);
  private readonly domains = inject(Domains).list;
  private readonly health = inject(DomainHealthChecks).byId;
  private readonly read = signal<ReadonlySet<string>>(readStored());

  private readonly domainList$ = toObservable(this.domains).pipe(filter((list): list is Domain[] => !!list));

  private readonly sending = toSignal(
    this.domainList$.pipe(
      switchMap((list) =>
        list.length === 0
          ? of([])
          : forkJoin(
              list.slice(0, SENDING_DOMAINS).map((d) =>
                this.api.domainSending(d.id).pipe(
                  map((s) => ({ domain: d, sent: s.sent, limit: s.limit })),
                  catchError(() => of(null)),
                ),
              ),
            ),
      ),
    ),
  );

  private readonly storage = toSignal(
    this.domainList$.pipe(
      switchMap((list) =>
        list.length === 0
          ? of([])
          : forkJoin(
              list.slice(0, STORAGE_DOMAINS).map((d) =>
                this.mailboxesApi.storage(d.id).pipe(
                  map((rows) => ({ domain: d, full: rows.filter((r) => r.limitBytes > 0 && r.usedBytes / r.limitBytes >= NEAR).length })),
                  catchError(() => of(null)),
                ),
              ),
            ),
      ),
    ),
  );

  private readonly invoices = toSignal(this.api.listInvoices().pipe(catchError(() => of([]))));

  readonly all = computed<Notice[]>(() => {
    const out: Notice[] = [];
    const health = this.health();
    for (const d of this.domains() ?? []) {
      if (d.status === 'failed') {
        out.push({ id: `failed-${d.id}`, tone: 'bad', title: `${d.name} couldn't be set up`, text: 'Remove it and add it again, or contact support.', link: `/domains/${d.id}` });
      } else if (d.status !== 'active') {
        out.push({ id: `dns-${d.id}`, tone: 'warn', title: `${d.name} isn't receiving mail yet`, text: 'Its DNS records still need to be set.', link: `/domains/${d.id}/dns` });
      } else if (health && needsAttention(d, health[d.id])) {
        out.push({ id: `dns-wrong-${d.id}`, tone: 'bad', title: `A DNS record of ${d.name} is wrong`, text: 'Mail may bounce or land in spam until it is fixed.', link: `/domains/${d.id}/dns` });
      }
    }
    for (const s of this.sending() ?? []) {
      if (s && s.limit > 0 && s.sent / s.limit >= 0.8) {
        const percent = Math.min(100, Math.round((s.sent / s.limit) * 100));
        out.push({
          id: `sending-${s.domain.id}-${percent >= 100 ? 'full' : 'near'}`,
          tone: percent >= 100 ? 'bad' : 'warn',
          title: `${s.domain.name} used ${percent}% of its daily sending limit`,
          text: percent >= 100 ? 'New mail waits in the queue until the limit frees up.' : `${s.sent} of ${s.limit} messages in the last 24 hours.`,
          link: `/domains/${s.domain.id}`,
        });
      }
    }
    for (const s of this.storage() ?? []) {
      if (s && s.full > 0) {
        out.push({
          id: `storage-${s.domain.id}-${s.full}`,
          tone: 'warn',
          title: `${s.full} ${s.full === 1 ? 'mailbox is' : 'mailboxes are'} nearly full on ${s.domain.name}`,
          text: 'A full mailbox stops receiving mail.',
          link: `/domains/${s.domain.id}/mailboxes/storage`,
        });
      }
    }
    for (const inv of this.invoices() ?? []) {
      if (inv.status === 'open') {
        out.push({ id: `invoice-${inv.id}`, tone: 'bad', title: `Invoice ${inv.number} is open`, text: 'Pay it to keep your plan running.', link: '/billing/invoices' });
      }
    }
    return out;
  });

  readonly unread = computed(() => this.all().filter((n) => !this.read().has(n.id)));

  isRead(notice: Notice): boolean {
    return this.read().has(notice.id);
  }

  markAllRead(): void {
    // Only what's listed now: ids of things that went away don't need keeping.
    const ids = new Set(this.all().map((n) => n.id));
    this.read.set(ids);
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
    } catch {
      // Not remembered; they show as unread again next time.
    }
  }
}

function readStored(): ReadonlySet<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
