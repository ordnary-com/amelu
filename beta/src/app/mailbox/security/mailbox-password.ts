import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxPasswordPage: send a reset link, or set the password directly. */
@Component({
  selector: 'amelu-mailbox-password',
  imports: [RouterLink, DitherShader, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Mailbox password">
      To change this mailbox password, enter a new one below, or send a password setup link to the mailbox owner's
      recovery address instead.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
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
                placeholder="For example: person@theirotheraddress.com"
                required
                [value]="recoveryEmail()"
                (input)="recoveryEmail.set($any($event.target).value); invite.reset()"
              />
              <span [class]="ui.hint + ' block'">An address the owner can read now, not this mailbox itself.</span>
            </label>
            <amelu-save-feedback [state]="invite" success="Invite sent." />
            <div class="-mx-4 -mb-4 flex justify-end border-t border-line bg-bg/40 px-4 py-3">
              <button type="submit" [class]="ui.outline" [disabled]="invite.busy()">
                {{ invite.busy() ? 'Sending...' : 'Send password reset link' }}
              </button>
            </div>
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
                placeholder="For example: not 123456 or qwertz"
                required
                minlength="8"
                [value]="password()"
                (input)="password.set($any($event.target).value); change.reset()"
              />
            </label>
            <ul class="-mx-4 divide-y divide-line border-t border-line" aria-label="Password requirements">
              <li class="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span
                  class="inline-flex size-5 flex-none items-center justify-center rounded-full transition-colors"
                  [class]="longEnough() ? 'bg-ok/15 text-ok' : 'bg-bg text-muted'"
                  aria-hidden="true"
                >
                  <amelu-icon name="check" [size]="12" />
                </span>
                <span [class.text-muted]="!longEnough()">At least 8 characters</span>
                <span class="sr-only">{{ longEnough() ? '(met)' : '(not met yet)' }}</span>
              </li>
            </ul>
            <amelu-save-feedback [state]="change" success="Password changed." />
            <div class="-mx-4 -mb-4 flex justify-end border-t border-line bg-bg/40 px-4 py-3">
              <button type="submit" [class]="ui.primary" [disabled]="change.busy()">
                {{ change.busy() ? 'Changing...' : 'Change password' }}
              </button>
            </div>
          </form>
        </section>
      </div>

      <aside class="space-y-6">
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="key" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Which one to use</h2>
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
            Mail apps signed in with the old password stop syncing until the new one is entered. See the
            <a [routerLink]="ctx.base() + '/usage'" class="font-medium text-link hover:underline">usage instructions</a>
            for the settings to enter.
          </p>
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
