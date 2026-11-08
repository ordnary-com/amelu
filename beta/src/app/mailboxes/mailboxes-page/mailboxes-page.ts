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
import { MailboxApi, RepairResult } from '../../mailbox/mailbox-api';
import { apiUrl } from '../../config';
import { countedMailboxes } from '../../standard-addresses';

/** The current dashboard's "All Mailboxes" page: every mailbox on one domain. */
@Component({
  selector: 'amelu-mailboxes-page',
  imports: [DatePipe, RouterLink, PageHeader, Alert, EmptyState, Icon],
  templateUrl: './mailboxes-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:keydown.escape)': 'closeDelete(); closeBulk()',
  },
})
export class MailboxesPage {
  private readonly api = inject(Api);
  private readonly mailboxesApi = inject(MailboxesApi);
  private readonly mailboxApi = inject(MailboxApi);
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
    // admin@, postmaster@ and abuse@ don't count toward the limit.
    const used = countedMailboxes(list);
    return {
      used,
      max: limit.max,
      plan: limit.plan,
      full: used >= limit.max,
      percent: Math.min(100, (used / Math.max(1, limit.max)) * 100),
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
    { label: 'Storage', hint: 'Who uses how much, and who is nearly full', link: 'mailboxes/storage' },
    { label: 'Import from CSV', hint: 'Create up to 100 mailboxes at once', link: 'mailboxes/import' },
    { label: 'Default services', hint: 'What new mailboxes may do', link: 'mailboxes/services' },
    { label: 'Default limits', hint: 'Storage caps for new mailboxes', link: 'mailboxes/limits' },
  ];

  protected readonly deleteTarget = signal<Mailbox | null>(null);
  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly repairing = signal(false);
  protected readonly repairResult = signal<{ checked: number; repaired: RepairResult[] } | null>(null);

  protected async repairAll(): Promise<void> {
    this.repairing.set(true);
    this.error.set(null);
    try {
      this.repairResult.set(await firstValueFrom(this.mailboxesApi.repairAll(this.ctx.id())));
      this.reloads.update((n) => n + 1);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not repair the mailboxes'));
    } finally {
      this.repairing.set(false);
    }
  }
  protected readonly deleted = signal<string | null>(null);

  // --- bulk actions ---
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedMailboxes = computed(() => (this.mailboxes() ?? []).filter((m) => this.selected().has(m.id)));
  protected readonly allShownSelected = computed(() => {
    const rows = this.filtered() ?? [];
    return rows.length > 0 && rows.every((m) => this.selected().has(m.id));
  });
  // Which bulk dialog is open: delete and storage ask first.
  protected readonly bulkDialog = signal<'delete' | 'limits' | null>(null);
  protected readonly bulkBusy = signal(false);
  protected readonly bulkProgress = signal<{ done: number; total: number } | null>(null);
  protected readonly bulkResult = signal<{ title: string; failed: { address: string; error: string }[] } | null>(null);
  // New passwords, shown once after "New passwords".
  protected readonly newPasswords = signal<{ address: string; password: string }[] | null>(null);
  protected readonly limitGb = signal('');

  protected toggle(mailbox: Mailbox): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(mailbox.id)) next.delete(mailbox.id);
      else next.add(mailbox.id);
      return next;
    });
  }

  protected toggleAll(): void {
    const rows = this.filtered() ?? [];
    this.selected.set(this.allShownSelected() ? new Set() : new Set(rows.map((m) => m.id)));
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected closeBulk(): void {
    if (!this.bulkBusy()) this.bulkDialog.set(null);
  }

  /** Runs one request per selected mailbox, one at a time, and keeps going past failures. */
  private async bulk(title: string, run: (m: Mailbox) => Promise<unknown>): Promise<void> {
    const targets = this.selectedMailboxes();
    if (targets.length === 0 || this.bulkBusy()) return;
    this.bulkBusy.set(true);
    this.bulkResult.set(null);
    this.bulkProgress.set({ done: 0, total: targets.length });
    const failed: { address: string; error: string }[] = [];
    for (const [i, mailbox] of targets.entries()) {
      try {
        await run(mailbox);
      } catch (err) {
        failed.push({ address: mailbox.address, error: errorMessage(err, 'Failed') });
      }
      this.bulkProgress.set({ done: i + 1, total: targets.length });
    }
    this.bulkBusy.set(false);
    this.bulkProgress.set(null);
    this.bulkDialog.set(null);
    this.bulkResult.set({ title: `${title}: ${targets.length - failed.length} of ${targets.length} done`, failed });
    this.clearSelection();
    this.reloads.update((n) => n + 1);
  }

  protected suspendSelected(): Promise<void> {
    return this.bulk('Suspended', (m) => firstValueFrom(this.mailboxApi.suspend(m.id)));
  }

  protected activateSelected(): Promise<void> {
    return this.bulk('Activated', (m) => firstValueFrom(this.mailboxApi.activate(m.id)));
  }

  protected deleteSelected(): Promise<void> {
    return this.bulk('Deleted', (m) => firstValueFrom(this.mailboxesApi.deleteMailbox(m.id)));
  }

  protected async newPasswordsForSelected(): Promise<void> {
    const made: { address: string; password: string }[] = [];
    await this.bulk('New passwords set', async (m) => {
      const password = randomPassword();
      await firstValueFrom(this.mailboxApi.setPassword(m.id, password));
      made.push({ address: m.address, password });
    });
    if (made.length) this.newPasswords.set(made);
  }

  protected async limitSelected(): Promise<void> {
    const gb = Number(this.limitGb());
    if (!Number.isFinite(gb) || gb <= 0) return;
    const bytes = Math.round(gb * 1024 ** 3);
    await this.bulk('Storage limit set', async (m) => {
      const current = await firstValueFrom(this.mailboxApi.limits(m.id));
      await firstValueFrom(this.mailboxApi.updateLimits(m.id, { ...current, maxDiskQuotaBytes: bytes }));
    });
  }

  protected copyPasswords(): void {
    const rows = this.newPasswords() ?? [];
    navigator.clipboard.writeText(rows.map((r) => `${r.address},${r.password}`).join('\n'));
  }

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

/** 20 characters from a set without look-alikes (no 0/O, 1/l/I). */
function randomPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(20));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
