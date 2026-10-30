import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { TokenFrame, tokenUi } from './token-frame';

/**
 * /reset-password/:token, from the "set your mailbox password" email
 * (POST /api/mailboxes/{id}/password/invite and the password reset).
 */
@Component({
  selector: 'amelu-reset-password',
  imports: [TokenFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amelu-token-frame>
      @switch (status()) {
        @case ('loading') {
          <p [class]="ui.text">Loading…</p>
        }
        @case ('invalid') {
          <h1 [class]="ui.title">This link doesn't work anymore</h1>
          <p [class]="ui.text">It's invalid or has expired. Ask for a new one to be sent.</p>
        }
        @case ('done') {
          <h1 [class]="ui.title">Password set</h1>
          <p [class]="ui.text">You can now sign in to {{ address() }} in your mail app.</p>
        }
        @default {
          <h1 [class]="ui.title">Set a password</h1>
          <p [class]="ui.text">For {{ address() }}. Use at least 8 characters.</p>
          <form class="mt-8" (submit)="submit($event)">
            <label for="new-password" [class]="ui.label">Password</label>
            <input
              id="new-password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
              [class]="ui.input"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
            />
            @if (error(); as message) {
              <p [class]="ui.error" role="alert">{{ message }}</p>
            }
            <button type="submit" [class]="ui.button" [disabled]="busy()">Set password</button>
          </form>
        }
      }
    </amelu-token-frame>
  `,
})
export class ResetPassword {
  private readonly tokenValue = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  private readonly token = () => this.tokenValue;
  private readonly api = inject(Api);
  protected readonly ui = tokenUi;
  protected readonly status = signal<'loading' | 'invalid' | 'valid' | 'done'>('loading');
  protected readonly address = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  ngOnInit(): void {
    firstValueFrom(this.api.passwordResetToken(this.token()))
      .then((r) => {
        if (r.valid && r.address) {
          this.address.set(r.address);
          this.status.set('valid');
        } else this.status.set('invalid');
      })
      .catch(() => this.status.set('invalid'));
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.completePasswordReset(this.token(), this.password()));
      this.status.set('done');
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not set the password'));
    } finally {
      this.busy.set(false);
    }
  }
}
