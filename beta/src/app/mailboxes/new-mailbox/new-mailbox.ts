import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, firstValueFrom, map, of, switchMap } from 'rxjs';
import { Api, Mailbox, errorMessage } from '../../api';
import { injectDomain } from '../../domain-context';
import { PageHeader } from '../../page-header/page-header';
import { Alert } from '../../alert/alert';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxesApi } from '../mailboxes-api';

type PasswordMethod = 'generate' | 'password';

/** The current dashboard's /domains/:id/mailboxes/new. */
@Component({
  selector: 'amelu-new-mailbox',
  imports: [RouterLink, PageHeader, Alert, Icon],
  templateUrl: './new-mailbox.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NewMailbox {
  private readonly api = inject(Api);
  private readonly mailboxesApi = inject(MailboxesApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly base = computed(() => `/domains/${this.ctx.id()}`);

  protected readonly localPart = signal('');
  protected readonly displayName = signal('');
  protected readonly method = signal<PasswordMethod>('generate');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  // The password is only ever in memory: the API can't read it back after creation.
  protected readonly result = signal<{ mailbox: Mailbox; generated: boolean } | null>(null);
  protected readonly copied = signal(false);

  protected readonly valid = computed(
    () =>
      this.localPart().trim() !== '' &&
      this.displayName().trim() !== '' &&
      (this.method() === 'generate' || this.password() !== ''),
  );

  // null while unknown (loading or failed), so the form never blocks on it.
  private readonly reloads = signal(0);
  protected readonly usage = toSignal(
    combineLatest([
      toObservable(computed(() => ({ id: this.ctx.id(), n: this.reloads() }))).pipe(
        switchMap(({ id }) => this.api.listMailboxes(id).pipe(catchError(() => of(null)))),
      ),
      this.api.billingOverview().pipe(catchError(() => of(null))),
    ]).pipe(
      map(([list, overview]) =>
        list && overview ? { used: list.length, max: overview.plan.maxMailboxesPerDomain, plan: overview.plan.name } : null,
      ),
    ),
    { initialValue: null },
  );
  protected readonly atLimit = computed(() => {
    const usage = this.usage();
    return !!usage && usage.used >= usage.max;
  });

  protected readonly steps = [
    { title: 'Create the mailbox', text: 'It gets the default services and limits set for this domain.' },
    { title: 'Save the password', text: 'It is shown once. You can set a new one from the mailbox later.' },
    { title: 'Sign in', text: 'From any mail app. The mailbox page shows the server settings to use.' },
  ];

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const generated = this.method() === 'generate';
    try {
      const mailbox = await firstValueFrom(
        this.mailboxesApi.createMailbox(this.ctx.id(), {
          localPart: this.localPart().trim(),
          displayName: this.displayName().trim(),
          password: generated ? '' : this.password(),
        }),
      );
      this.result.set({ mailbox, generated });
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not create mailbox'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(): Promise<void> {
    const password = this.result()?.mailbox.password;
    if (!password) return;
    await navigator.clipboard.writeText(password);
    this.copied.set(true);
  }

  protected another(): void {
    this.result.set(null);
    this.localPart.set('');
    this.displayName.set('');
    this.password.set('');
    this.showPassword.set(false);
    this.copied.set(false);
    this.reloads.update((n) => n + 1);
  }
}
