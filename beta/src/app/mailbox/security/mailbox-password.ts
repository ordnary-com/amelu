import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxPasswordPage: send a reset link, or set the password directly. */
@Component({
  selector: 'amelu-mailbox-password',
  imports: [RouterLink, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Mailbox password">
      To change this mailbox password, enter a new one below, or send a password setup link to the mailbox owner's
      recovery address instead.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        <section>
          <h2 [class]="ui.sectionTitle">Send password reset link</h2>
          <form [class]="ui.card + ' space-y-4 p-4'" (submit)="sendInvite($event)">
            <p class="text-[13px] leading-relaxed text-muted">
              Sends a one-time link, valid for 24 hours, that lets the recipient set their own password without you
              seeing or choosing it.
            </p>
            <label class="block">
              <span [class]="ui.label">Recovery email</span>
              <input
                type="email"
                [class]="ui.input"
                placeholder="eg. person@theirotheraddress.com"
                required
                [value]="recoveryEmail()"
                (input)="recoveryEmail.set($any($event.target).value); invite.reset()"
              />
              <span [class]="ui.hint">An address the owner can read now, not this mailbox itself.</span>
            </label>
            <amelu-save-feedback [state]="invite" success="Invite sent." />
            <button type="submit" [class]="ui.outline" [disabled]="invite.busy()">
              {{ invite.busy() ? 'Sending...' : 'Send password reset link' }}
            </button>
          </form>
        </section>

        <section>
          <h2 [class]="ui.sectionTitle">Set new password</h2>
          <form [class]="ui.card + ' space-y-4 p-4'" (submit)="setPassword($event)">
            <label class="block">
              <span [class]="ui.label">Password</span>
              <input
                type="password"
                autocomplete="new-password"
                [class]="ui.input"
                placeholder="eg. not 123456 or qwertz"
                required
                minlength="8"
                [value]="password()"
                (input)="password.set($any($event.target).value); change.reset()"
              />
              <span [class]="ui.hint">At least 8 characters.</span>
            </label>
            <amelu-save-feedback [state]="change" success="Password changed." />
            <button type="submit" [class]="ui.primary" [disabled]="change.busy()">
              {{ change.busy() ? 'Changing...' : 'Change password' }}
            </button>
          </form>
        </section>
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Which one to use</h2>
          <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-ok"></span>
              A reset link when someone else uses this mailbox: only they ever know the password.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              Setting it here when you use the mailbox yourself, or need access right away.
            </li>
          </ul>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">After a change</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Mail apps signed in with the old password stop syncing until the new one is entered.
          </p>
          <a [routerLink]="ctx.base() + '/usage'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Usage instructions
          </a>
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

  protected readonly recoveryEmail = signal('');
  protected readonly invite = new Saving();

  protected readonly password = signal('');
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
