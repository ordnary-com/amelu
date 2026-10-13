import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import { Api, Mailbox, errorMessage } from '../../api';
import { injectDomain } from '../../domain-context';
import { PageHeader } from '../../page-header/page-header';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { MAILBOX_STATUS, badgeClass } from '../../status';
import { UI } from '../../ui';
import { MailboxesApi } from '../mailboxes-api';
import { apiUrl } from '../../config';

/** The current dashboard's "All Mailboxes" page: every mailbox on one domain. */
@Component({
  selector: 'amelu-mailboxes-page',
  imports: [DatePipe, RouterLink, PageHeader, Alert, EmptyState, Icon],
  templateUrl: './mailboxes-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:keydown.escape)': 'closeDelete()',
  },
})
export class MailboxesPage {
  private readonly api = inject(Api);
  private readonly mailboxesApi = inject(MailboxesApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  private readonly reloads = signal(0);
  // undefined while loading, null when the request failed
  protected readonly mailboxes = toSignal(
    toObservable(computed(() => ({ id: this.ctx.id(), n: this.reloads() }))).pipe(
      switchMap(({ id }) =>
        this.api.listMailboxes(id).pipe(
          map((list): Mailbox[] | null | undefined => list.slice().sort((a, b) => a.address.localeCompare(b.address))),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
    { initialValue: undefined },
  );

  private readonly limit = toSignal(
    this.api.billingOverview().pipe(
      map((overview) => ({ max: overview.plan.maxMailboxesPerDomain, plan: overview.plan.name })),
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );

  protected readonly usage = computed(() => {
    const limit = this.limit();
    const list = this.mailboxes();
    if (!limit || !list) return null;
    return {
      used: list.length,
      max: limit.max,
      plan: limit.plan,
      full: list.length >= limit.max,
      percent: Math.min(100, (list.length / Math.max(1, limit.max)) * 100),
    };
  });

  protected readonly search = signal('');
  protected readonly filtered = computed(() => {
    const list = this.mailboxes();
    if (!list) return list;
    const query = this.search().trim().toLowerCase();
    if (!query) return list;
    return list.filter((m) => m.address.toLowerCase().includes(query) || m.displayName.toLowerCase().includes(query));
  });

  protected readonly base = computed(() => `/domains/${this.ctx.id()}`);
  protected readonly exportUrl = computed(() => apiUrl(`/api/domains/${this.ctx.id()}/mailboxes/export`));

  protected readonly settings = [
    { label: 'Import from CSV', hint: 'Create up to 100 mailboxes at once', link: 'mailboxes/import' },
    { label: 'Default services', hint: 'What new mailboxes may do', link: 'mailboxes/services' },
    { label: 'Default limits', hint: 'Storage caps for new mailboxes', link: 'mailboxes/limits' },
  ];

  protected readonly deleteTarget = signal<Mailbox | null>(null);
  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deleted = signal<string | null>(null);

  protected status(mailbox: Mailbox) {
    const status = MAILBOX_STATUS[mailbox.status];
    return { label: status.label, class: badgeClass(status.tone) };
  }

  protected closeDelete(): void {
    if (!this.deleting()) this.deleteTarget.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleting.set(true);
    this.error.set(null);
    this.deleted.set(null);
    try {
      await firstValueFrom(this.mailboxesApi.deleteMailbox(target.id));
      this.deleted.set(target.address);
      this.deleteTarget.set(null);
      this.reloads.update((n) => n + 1);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not delete the mailbox.'));
      this.deleteTarget.set(null);
    } finally {
      this.deleting.set(false);
    }
  }
}
