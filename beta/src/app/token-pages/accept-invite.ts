import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { Session } from '../session';
import { TokenFrame, tokenUi } from './token-frame';

/** /accept-invite/:token, from the email an organization invitation sends. */
@Component({
  selector: 'amelu-accept-invite',
  imports: [TokenFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amelu-token-frame>
      @switch (status()) {
        @case ('loading') {
          <p [class]="ui.text">Loading…</p>
        }
        @case ('invalid') {
          <h1 [class]="ui.title">This invitation doesn't work anymore</h1>
          <p [class]="ui.text">It's invalid, expired or already used. Ask for a new one to be sent.</p>
        }
        @case ('existing') {
          <h1 [class]="ui.title">You already have an Amelu account</h1>
          <p [class]="ui.text">
            An account already exists for {{ email() }}. One account can't belong to more than one organization yet,
            so sign in with that account instead.
          </p>
          <a href="/login" [class]="ui.button">Go to sign in</a>
        }
        @default {
          <h1 [class]="ui.title">Join {{ organization() }}</h1>
          <p [class]="ui.text">You're invited as {{ email() }} ({{ role() }}).</p>
          <form class="mt-8 space-y-4" (submit)="submit($event)">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="first-name" [class]="ui.label">First name</label>
                <input id="first-name" required [class]="ui.input" [value]="firstName()" (input)="firstName.set($any($event.target).value)" />
              </div>
              <div>
                <label for="last-name" [class]="ui.label">Last name</label>
                <input id="last-name" required [class]="ui.input" [value]="lastName()" (input)="lastName.set($any($event.target).value)" />
              </div>
            </div>
            <div>
              <label for="username" [class]="ui.label">Username</label>
              <input id="username" required autocomplete="username" [class]="ui.input" [value]="username()" (input)="username.set($any($event.target).value)" />
            </div>
            <div>
              <label for="password" [class]="ui.label">Password</label>
              <input
                id="password"
                type="password"
                autocomplete="new-password"
                minlength="8"
                required
                [class]="ui.input"
                [value]="password()"
                (input)="password.set($any($event.target).value)"
              />
            </div>
            @if (error(); as message) {
              <p [class]="ui.error" role="alert">{{ message }}</p>
            }
            <button type="submit" [class]="ui.button" [disabled]="busy()">Accept invitation</button>
          </form>
        }
      }
    </amelu-token-frame>
  `,
})
export class AcceptInvite {
  private readonly tokenValue = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  private readonly token = () => this.tokenValue;
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  protected readonly ui = tokenUi;
  protected readonly status = signal<'loading' | 'invalid' | 'existing' | 'valid'>('loading');
  protected readonly email = signal('');
  protected readonly role = signal('');
  protected readonly organization = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  ngOnInit(): void {
    firstValueFrom(this.api.invitation(this.token()))
      .then((r) => {
        if (!r.valid || !r.email) return this.status.set('invalid');
        this.email.set(r.email);
        this.role.set((r.role ?? '').replace('_', ' '));
        this.organization.set(r.organizationName ?? 'the organization');
        this.status.set(r.existingAccount ? 'existing' : 'valid');
      })
      .catch(() => this.status.set('invalid'));
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.busy.set(true);
    try {
      const customer = await firstValueFrom(
        this.api.acceptInvitation(this.token(), {
          password: this.password(),
          firstName: this.firstName(),
          lastName: this.lastName(),
          username: this.username(),
        }),
      );
      this.session.customer.set(customer);
      await this.router.navigateByUrl('/');
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not accept the invitation'));
    } finally {
      this.busy.set(false);
    }
  }
}
