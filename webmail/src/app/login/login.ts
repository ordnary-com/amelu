import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorCode, errorMessage } from '../api';
import { Session } from '../session';
import { Alert } from '../alert';
import { UI } from '../ui';

const CODES: Record<string, string> = {
  INVALID_CREDENTIALS: 'That email address and password do not match.',
  MAILBOX_SUSPENDED: 'This mailbox is suspended. Contact whoever manages your domain.',
  MAILBOX_NOT_FOUND: 'There is no mailbox with that address on Amelu.',
};

/** Sign in with a mailbox address and its password. */
@Component({
  selector: 'amelu-login',
  imports: [FormsModule, Alert],
  template: `
    <div class="flex min-h-dvh flex-col items-center justify-center p-4">
      <form
        class="w-full max-w-sm rounded-lg border border-line bg-surface p-6"
        (ngSubmit)="submit()"
      >
        <img src="/amelu-logo.png" alt="Amelu" class="h-7 dark:brightness-0 dark:invert" />
        <h1 class="mt-5 text-[20px] font-bold tracking-[-0.3px]">Sign in to your mailbox</h1>
        <p class="mt-1 text-[13px] text-muted">
          Use your full email address and the mailbox password.
        </p>

        @if (error(); as message) {
          <amelu-alert class="mt-4" kind="error">{{ message }}</amelu-alert>
        }

        <label [class]="ui.label + ' mt-5'" for="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="username"
          required
          [class]="ui.input"
          [(ngModel)]="email"
          placeholder="you@yourdomain.com"
        />

        <label [class]="ui.label + ' mt-4'" for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          [class]="ui.input"
          [(ngModel)]="password"
        />

        <button
          type="submit"
          [class]="ui.primary + ' mt-6 h-9 w-full justify-center'"
          [disabled]="busy()"
        >
          {{ busy() ? 'Signing in' : 'Sign in' }}
        </button>

        <p class="mt-5 text-[12px] leading-relaxed text-muted">
          Forgot the password? Whoever manages your domain in the Amelu dashboard can set a new one.
        </p>
      </form>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class Login {
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  protected readonly ui = UI;

  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly returnTo = computed(() => {
    const value = this.params()?.get('returnTo') ?? '/';
    return value.startsWith('/') && !value.startsWith('//') ? value : '/';
  });

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const account = await firstValueFrom(
        this.api.login(this.email.trim().toLowerCase(), this.password),
      );
      this.session.account.set(account);
      await this.router.navigateByUrl(this.returnTo());
    } catch (err) {
      this.error.set(CODES[errorCode(err) ?? ''] ?? errorMessage(err, 'Could not sign in'));
    } finally {
      this.busy.set(false);
    }
  }
}
