import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { Session } from '../session';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { MiscApi } from './misc-api';

// Same solid red as the Terminate account button on the account page.
const RED_BUTTON =
  'inline-flex h-8 cursor-pointer items-center rounded-md bg-[#d91515] px-3 text-[13px] font-medium text-white hover:brightness-110 disabled:cursor-default disabled:opacity-50';

/** The current dashboard's /account/terminate: password, then a confirm dialog, then DELETE /api/account. */
@Component({
  selector: 'amelu-terminate-account',
  imports: [PageHeader, Alert, RouterLink],
  template: `
    <amelu-page-header
      title="Terminate account"
      [crumbs]="[{ label: 'My Account', link: '/account' }, { label: 'Terminate account' }]"
    >
      This permanently deletes your account and organization, including every domain and mailbox under it, from the
      mail cluster. This cannot be undone.
    </amelu-page-header>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-4">
        @if (error(); as message) {
          <amelu-alert kind="error" title="Could not terminate account" [dismissible]="true" (dismissed)="error.set(null)">
            {{ message }}
          </amelu-alert>
        }

        <section>
          <h2 [class]="ui.sectionTitle">Confirm it's you</h2>
          <form [class]="ui.card + ' p-4'" (submit)="startConfirm($event)">
            <label class="block max-w-sm">
              <span [class]="ui.label">Current password</span>
              <input
                type="password"
                autocomplete="current-password"
                [class]="ui.input"
                [value]="password()"
                (input)="password.set($any($event.target).value)"
                required
              />
            </label>
            <div class="mt-4 flex flex-wrap gap-2">
              <button type="submit" [class]="redButton" [disabled]="!password() || busy()">Terminate account</button>
              <a routerLink="/account" [class]="ui.outline">Cancel</a>
            </div>
          </form>
        </section>
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">What gets deleted</h2>
          <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-bad"></span>
              Every domain and mailbox, including all mail stored in them.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-bad"></span>
              Your account and organization, and their settings and API keys.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              You're signed out right away. There is no way to recover this data afterwards.
            </li>
          </ul>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Part of a team?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            If your organization has other members, have another owner or admin remove you, or transfer ownership,
            instead. Their domains and mailboxes stay intact.
          </p>
          <a routerLink="/organization" class="mt-3 inline-block text-[13px] font-medium text-link hover:underline">
            View organization
          </a>
        </section>
      </aside>
    </div>

    @if (confirming()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="closeConfirm()">
        <div
          class="w-full max-w-md rounded-lg border border-line bg-popover p-5 shadow-xl"
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
            <button type="button" [class]="redButton" (click)="terminate()" [disabled]="busy()">
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
  protected readonly redButton = RED_BUTTON;

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
