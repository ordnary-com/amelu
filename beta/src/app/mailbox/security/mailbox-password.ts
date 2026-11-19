import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, IconName } from '../../icon';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

type PasswordMethod = 'invite' | 'password';

/** The current dashboard's MailboxPasswordPage: send a reset link, or set the password directly. */
@Component({
  selector: 'amelu-mailbox-password',
  imports: [RouterLink, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Mailbox password">
      Send the owner a link to set their own password, or set a new one yourself.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Change the password</h2>
          </div>
          <div class="p-4">
            <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How to change the password">
              @for (option of methods; track option.value) {
                <label class="flex items-center gap-4 px-[18px] py-4" [class]="ui.choice + ' ' + (method() === option.value ? ui.choiceOn : ui.choiceOff)">
                  <input
                    type="radio"
                    name="password-method"
                    class="sr-only"
                    [value]="option.value"
                    [checked]="method() === option.value"
                    (change)="method.set(option.value)"
                  />
                  <amelu-icon [name]="option.icon" [size]="26" class="flex-none" [class]="method() === option.value ? 'text-link' : 'text-ink'" />
                  <span class="min-w-0">
                    <span class="block text-[14px] font-medium" [class]="method() === option.value ? 'text-link' : 'text-ink'">{{ option.title }}</span>
                    <span class="mt-0.5 block text-[13px] leading-snug" [class]="method() === option.value ? 'text-link/85' : 'text-muted'">{{ option.text }}</span>
                  </span>
                </label>
              }
            </div>
          </div>

          @if (method() === 'invite') {
            <form class="border-t border-line" (submit)="sendInvite($event)">
              <div class="space-y-4 p-4">
                <amelu-save-feedback [state]="invite" success="Invite sent." />
                <div>
                  <label for="recovery-email" class="block text-[15px] font-medium">Recovery email</label>
                  <input
                    id="recovery-email"
                    type="email"
                    [class]="bigInput + ' mt-3'"
                    placeholder="person@theirotheraddress.com"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    required
                    [value]="recoveryEmail()"
                    (input)="recoveryEmail.set($any($event.target).value); invite.reset()"
                  />
                  <p class="mt-2 text-[12px] text-muted">An address the owner can read now, not this mailbox itself.</p>
                </div>
              </div>
              <p [class]="ui.setNote">
                <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
                <span>The link works once and for 24 hours. The owner picks their own password, so you never see it.</span>
              </p>
              <div class="flex items-center gap-3 border-t border-line px-4 py-3">
                <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="invite.busy()">
                  {{ invite.busy() ? 'Sending...' : 'Send password reset link' }}
                </button>
              </div>
            </form>
          } @else {
            <form class="border-t border-line" (submit)="setPassword($event)">
              <div class="space-y-4 p-4">
                <amelu-save-feedback [state]="change" success="Password changed." />
                <div>
                  <label for="new-password" class="block text-[15px] font-medium">New password</label>
                  <div class="mt-3 flex items-center gap-2">
                    <input
                      id="new-password"
                      [type]="showPassword() ? 'text' : 'password'"
                      autocomplete="new-password"
                      [class]="bigInput"
                      placeholder="Not 123456 or qwerty"
                      required
                      minlength="8"
                      [value]="password()"
                      (input)="password.set($any($event.target).value); change.reset()"
                    />
                    <button type="button" [class]="ui.outline + ' h-11 flex-none px-4'" (click)="showPassword.set(!showPassword())">
                      {{ showPassword() ? 'Hide' : 'Show' }}
                    </button>
                  </div>
                  <p class="mt-2 flex items-center gap-2 text-[12px]" aria-live="polite">
                    <amelu-icon [name]="longEnough() ? 'circleCheck' : 'circleAlert'" [size]="14" [class]="longEnough() ? 'text-ok' : 'text-muted'" />
                    <span [class]="longEnough() ? 'text-ok' : 'text-muted'">At least 8 characters</span>
                    <span class="sr-only">{{ longEnough() ? '(met)' : '(not met yet)' }}</span>
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3 border-t border-line px-4 py-3">
                <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="change.busy()">
                  {{ change.busy() ? 'Changing...' : 'Change password' }}
                </button>
              </div>
            </form>
          }
        </section>
      </div>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Which one to use</h2>
          </div>
          <div [class]="ui.well">
            <ul class="space-y-2 text-[13px] leading-relaxed text-muted">
              <li class="flex gap-2.5">
                <span class="mt-[7px] size-1.5 flex-none rounded-full bg-ok"></span>
                A reset link when someone else uses this mailbox: only they ever know the password.
              </li>
              <li class="flex gap-2.5">
                <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
                Setting it yourself when you use the mailbox, or need access right away.
              </li>
            </ul>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">After a change</h2>
            <a [routerLink]="ctx.base() + '/usage'" class="text-[13px] text-link hover:underline">Usage instructions</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Mail apps signed in with the old password stop syncing until the new one is entered.
            </p>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxPassword {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly methods: { value: PasswordMethod; title: string; text: string; icon: IconName }[] = [
    { value: 'invite', title: 'Send a reset link', text: 'The owner sets their own password from their recovery address.', icon: 'mail' },
    { value: 'password', title: 'Set it myself', text: 'Type a new one, for example when you use the mailbox yourself.', icon: 'key' },
  ];
  protected readonly method = signal<PasswordMethod>('invite');
  protected readonly bigInput =
    'h-11 w-full min-w-0 rounded-md border border-line bg-surface px-3.5 text-[15px] outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25';

  protected readonly recoveryEmail = signal('');
  protected readonly invite = new Saving();

  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly longEnough = computed(() => this.password().length >= 8);
  protected readonly change = new Saving();

  protected async sendInvite(event: Event): Promise<void> {
    event.preventDefault();
    await this.invite.run(this.api.invitePassword(this.ctx.id(), this.recoveryEmail()), 'Could not send invite');
  }

  protected async setPassword(event: Event): Promise<void> {
    event.preventDefault();
    if (await this.change.run(this.api.setPassword(this.ctx.id(), this.password()), 'Could not change password')) this.password.set('');
  }
}
