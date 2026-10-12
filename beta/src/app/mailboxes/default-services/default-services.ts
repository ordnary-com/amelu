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
import { EnabledServices, MailboxesApi } from '../mailboxes-api';

type ServiceKey = keyof EnabledServices;

/** The current dashboard's Default Mailbox Services: the services a new mailbox on this domain starts with. */
@Component({
  selector: 'amelu-default-services',
  imports: [RouterLink, PageHeader, Alert, EmptyState],
  templateUrl: './default-services.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DefaultServices {
  private readonly api = inject(MailboxesApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly base = computed(() => `/domains/${this.ctx.id()}`);

  protected readonly services: { key: ServiceKey; label: string; hint: string }[] = [
    { key: 'maySend', label: 'May send', hint: 'Send mail over SMTP.' },
    { key: 'mayReceive', label: 'May receive', hint: 'Accept incoming mail for the address.' },
    { key: 'mayImap', label: 'May access over IMAP', hint: 'Read mail in a mail app, kept in sync with the server.' },
    { key: 'mayPop3', label: 'May access over POP3', hint: 'Download mail to a single device.' },
  ];

  // undefined while loading, null when the request failed
  private readonly loaded = toSignal(
    toObservable(this.ctx.id).pipe(
      switchMap((id) =>
        this.api.defaultServices(id).pipe(
          map((s): EnabledServices | null | undefined => s),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
    { initialValue: undefined },
  );

  protected readonly saved = linkedSignal(() => this.loaded());
  protected readonly draft = linkedSignal<EnabledServices | null>(() => {
    const saved = this.saved();
    return saved ? { ...saved } : null;
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal(false);

  protected readonly dirty = computed(() => {
    const saved = this.saved();
    const draft = this.draft();
    return !!saved && !!draft && (Object.keys(draft) as ServiceKey[]).some((key) => draft[key] !== saved[key]);
  });
  protected readonly enabledCount = computed(() => {
    const draft = this.draft();
    return draft ? Object.values(draft).filter(Boolean).length : 0;
  });

  protected toggle(key: ServiceKey): void {
    this.success.set(false);
    this.draft.update((d) => (d ? { ...d, [key]: !d[key] } : d));
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const draft = this.draft();
    if (!draft || this.busy()) return;
    this.error.set(null);
    this.success.set(false);
    this.busy.set(true);
    try {
      const saved = await firstValueFrom(this.api.updateDefaultServices(this.ctx.id(), draft));
      this.saved.set(saved);
      this.success.set(true);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not save default services'));
    } finally {
      this.busy.set(false);
    }
  }
}
