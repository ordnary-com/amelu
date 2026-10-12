import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import { errorMessage } from '../../api';
import { injectDomain } from '../../domain-context';
import { PageHeader } from '../../page-header/page-header';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxLimits, MailboxesApi } from '../mailboxes-api';

const BYTES_PER_GB = 1024 * 1024 * 1024;

/** The current dashboard's Default Mailbox Limits: the storage caps a new mailbox on this domain starts with. */
@Component({
  selector: 'amelu-default-limits',
  imports: [RouterLink, PageHeader, Alert, EmptyState],
  templateUrl: './default-limits.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DefaultLimits {
  private readonly api = inject(MailboxesApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly base = computed(() => `/domains/${this.ctx.id()}`);

  // undefined while loading, null when the request failed
  private readonly loaded = toSignal(
    toObservable(this.ctx.id).pipe(
      switchMap((id) =>
        this.api.defaultLimits(id).pipe(
          map((l): MailboxLimits | null | undefined => l),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
    { initialValue: undefined },
  );

  protected readonly saved = linkedSignal(() => this.loaded());
  protected readonly maxEmails = linkedSignal(() => {
    const saved = this.saved();
    return saved ? String(saved.maxEmails) : '';
  });
  protected readonly maxDiskGb = linkedSignal(() => {
    const saved = this.saved();
    return saved ? formatGb(saved.maxDiskQuotaBytes) : '';
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal(false);

  private readonly parsed = computed<MailboxLimits | null>(() => {
    const emails = Number(this.maxEmails());
    const gb = Number(this.maxDiskGb());
    if (this.maxEmails().trim() === '' || this.maxDiskGb().trim() === '') return null;
    if (!Number.isFinite(emails) || !Number.isFinite(gb) || emails < 0 || gb < 0) return null;
    return { maxEmails: Math.round(emails), maxDiskQuotaBytes: Math.round(gb * BYTES_PER_GB) };
  });
  protected readonly invalid = computed(() => !!this.saved() && this.parsed() === null);
  protected readonly dirty = computed(() => {
    const saved = this.saved();
    const parsed = this.parsed();
    return !!saved && !!parsed && (parsed.maxEmails !== saved.maxEmails || parsed.maxDiskQuotaBytes !== saved.maxDiskQuotaBytes);
  });

  protected set(field: 'emails' | 'disk', value: string): void {
    this.success.set(false);
    (field === 'emails' ? this.maxEmails : this.maxDiskGb).set(value);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const parsed = this.parsed();
    if (!parsed || this.busy()) return;
    this.error.set(null);
    this.success.set(false);
    this.busy.set(true);
    try {
      this.saved.set(await firstValueFrom(this.api.updateDefaultLimits(this.ctx.id(), parsed)));
      this.success.set(true);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not save default limits'));
    } finally {
      this.busy.set(false);
    }
  }
}

function formatGb(bytes: number): string {
  return bytes === 0 ? '0' : String(bytes / BYTES_PER_GB);
}
