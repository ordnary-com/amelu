import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { Session } from '../session';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { Icon } from '../icon';
import { MiscApi } from './misc-api';

/** The current dashboard's /account/terminate: password, then a confirm dialog, then DELETE /api/account. */
@Component({
  selector: 'amelu-terminate-account',
  imports: [Alert, RouterLink, Icon],
  template: `
    <div class="space-y-5">
      @if (error(); as message) {
        <amelu-alert kind="error" title="Could not terminate account" [dismissible]="true" (dismissed)="error.set(null)">
          {{ message }}
        </amelu-alert>
      }

      <section [class]="ui.setCard">
        <div [class]="ui.setHeader">
          <h2 [class]="ui.setTitle + ' text-bad'">Terminate Account</h2>
        </div>
        <div class="px-5 py-4">
          <p class="text-[13px] text-muted">What gets deleted</p>
          <ul class="mt-2 space-y-2 text-[14px] leading-relaxed">
            <li class="flex items-start gap-2.5">
              <amelu-icon name="circleX" [size]="16" class="mt-0.5 flex-none text-bad" />
              Every domain and mailbox, including all mail stored in them.
            </li>
            <li class="flex items-start gap-2.5">
              <amelu-icon name="circleX" [size]="16" class="mt-0.5 flex-none text-bad" />
              Your account and organization, and their settings and API keys.
            </li>
            <li class="flex items-start gap-2.5 text-muted">
              <amelu-icon name="logout" [size]="16" class="mt-0.5 flex-none" />
              You're signed out right away. There is no way to recover this data afterwards.
            </li>
          </ul>
        </div>
        <p [class]="ui.setNote">
          <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
          <span>
            Part of a team? Have another owner or admin remove you, or transfer ownership, instead. Their domains and
            mailboxes stay intact. <a routerLink="/organization" class="text-link hover:underline">View organization</a>
          </span>
        </p>
      </section>

      <section [class]="ui.setCard">
        <div [class]="ui.setHeader">
          <h2 [class]="ui.setTitle">Confirm It's You</h2>
        </div>
        <form class="flex flex-wrap items-end gap-3 px-5 py-4" (submit)="startConfirm($event)">
          <label class="w-full max-w-sm">
            <span class="text-[13px] text-muted">Current password</span>
            <input
              type="password"
              autocomplete="current-password"
              [class]="ui.input"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
              required
            />
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="submit" [class]="ui.dangerOutline + ' h-9'" [disabled]="!password() || busy()">Terminate account</button>
            <a routerLink="/account" [class]="ui.outline + ' h-9'">Cancel</a>
          </div>
        </form>
      </section>
    </div>

    @if (confirming()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="closeConfirm()">
        <div
          class="w-full max-w-md rounded-md border border-line bg-popover p-5 shadow-xl"
          role="alertdialog"
          aria-modal="true"
          aria-label="Permanently terminate your account?"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-[15px] font-bold">Permanently terminate your account?</h3>
          <p class="mt-2 text-[13px] leading-relaxed text-muted">
            This immediately and permanently deletes your account and organization, including every domain and mailbox
            under it. There is no way to recover this data afterwards.
          </p>
          <div class="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" [class]="ui.outline" (click)="closeConfirm()" [disabled]="busy()">Cancel</button>
            <button type="button" [class]="ui.danger" (click)="terminate()" [disabled]="busy()">
              {{ busy() ? 'Terminating...' : 'Yes, permanently terminate my account' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:keydown.escape)': 'closeConfirm()',
  },
})
export class TerminateAccount {
  private readonly api = inject(MiscApi);
  private readonly session = inject(Session);
  protected readonly ui = UI;

  protected readonly password = signal('');
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected startConfirm(event: Event): void {
    event.preventDefault();
    if (!this.password()) return;
    this.confirming.set(true);
  }

  protected closeConfirm(): void {
    if (!this.busy()) this.confirming.set(false);
  }

  protected async terminate(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.terminateAccount(this.password()));
      await this.session.logout();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not terminate account'));
      this.confirming.set(false);
      this.busy.set(false);
    }
  }
}
