import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { Session } from '../session';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { Icon } from '../icon';
import { MiscApi } from './misc-api';
import { terminateConfirmUrl } from '../config';

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
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          @if (confirmed()) {
            <p class="flex items-center gap-2 text-[14px] text-ok">
              <amelu-icon name="circleCheck" [size]="17" />
              Confirmed with your Ordnary account
            </p>
          } @else {
            <p class="text-[14px] text-muted">Sign in to your Ordnary account again to confirm it's you.</p>
          }
          <div class="flex flex-wrap gap-2">
            @if (confirmed()) {
              <button type="button" [class]="ui.dangerOutline + ' h-9'" [disabled]="busy()" (click)="confirming.set(true)">Terminate account</button>
            } @else {
              <a [href]="confirmUrl" [class]="ui.primary + ' h-9'">Confirm with Ordnary</a>
            }
            <a routerLink="/account" [class]="ui.outline + ' h-9'">Cancel</a>
          </div>
        </div>
        <p [class]="ui.setNote">
          <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
          <span>Amelu has no password of its own: you sign in with Ordnary. A confirmation counts for 10 minutes.</span>
        </p>
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

  protected readonly confirmUrl = terminateConfirmUrl();
  /** Back from Ordnary's sign-in form; the API checks the confirmation itself. */
  protected readonly confirmed = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('confirm') === 'ok');
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const confirm = inject(ActivatedRoute).snapshot.queryParamMap.get('confirm');
    if (confirm === 'mismatch') this.error.set('That Ordnary account isn\'t the one signed in here. Confirm with the account you use for Amelu.');
    if (confirm === 'failed') this.error.set('The confirmation couldn\'t be saved. Try again.');
  }

  protected closeConfirm(): void {
    if (!this.busy()) this.confirming.set(false);
  }

  protected async terminate(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.terminateAccount());
      await this.session.logout();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not terminate account'));
      // Most likely the confirmation ran out: ask for a new one.
      if ((err as { status?: number })?.status === 403) this.confirmed.set(false);
      this.confirming.set(false);
      this.busy.set(false);
    }
  }
}
