import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

/** The current dashboard's DeleteMailboxPage, with the same confirmation step. */
@Component({
  selector: 'amelu-delete-mailbox',
  imports: [RouterLink, Alert, Icon, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Delete mailbox">Permanently erase this mailbox and everything in it.</amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        @if (error(); as message) {
          <amelu-alert kind="error" title="The mailbox wasn't deleted" [dismissible]="true" (dismissed)="error.set(null)">
            {{ message }}
          </amelu-alert>
        }

        <section [class]="ui.setCard">
          <div [class]="ui.setHeader">
            <h2 [class]="ui.setTitle + ' min-w-0 truncate text-bad'">Delete {{ ctx.mailbox()?.address ?? 'this mailbox' }}</h2>
          </div>
          <div class="px-5 py-4">
            <p class="text-[14px] leading-relaxed">
              Deleting a mailbox removes it from the mail server for good, along with everything stored in it. Suspending
              only pauses it and keeps all of that.
            </p>
            <p class="mt-4 text-[13px] text-muted">What gets deleted</p>
            <ul class="mt-2 space-y-2 text-[14px] leading-relaxed" aria-label="What deleting does">
              <li class="flex items-start gap-2.5">
                <amelu-icon name="circleX" [size]="16" class="mt-0.5 flex-none text-bad" />
                Every message in it is erased.
              </li>
              <li class="flex items-start gap-2.5">
                <amelu-icon name="circleX" [size]="16" class="mt-0.5 flex-none text-bad" />
                Its aliases and settings are erased.
              </li>
              <li class="flex items-start gap-2.5">
                <amelu-icon name="circleX" [size]="16" class="mt-0.5 flex-none text-bad" />
                Mail sent to the address bounces from then on.
              </li>
              <li class="flex items-start gap-2.5 text-muted">
                <amelu-icon name="circleAlert" [size]="16" class="mt-0.5 flex-none" />
                This can't be undone, and the data can't be recovered.
              </li>
            </ul>
          </div>
          <p [class]="ui.setNote">
            <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
            <span>Want to keep any of the mail? Download it with a mail app before you delete the mailbox.</span>
          </p>
          <div class="flex items-center gap-3 border-t border-line px-5 py-3">
            <button type="button" [class]="ui.dangerOutline + ' h-9'" [disabled]="!ctx.mailbox()" (click)="confirming.set(true)">
              Delete this mailbox
            </button>
          </div>
        </section>
      </div>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Only need a break?</h2>
            <a [routerLink]="ctx.base()" class="text-[13px] text-link hover:underline">Suspend</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Suspending from the overview stops all mail and sign-ins but keeps everything, so it can be undone.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Later, not now?</h2>
            <a [routerLink]="ctx.base() + '/expiration'" class="text-[13px] text-link hover:underline">Expiration</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              An expiration date suspends or erases the mailbox automatically on a day you pick.
            </p>
          </div>
        </section>
      </aside>
    </div>

    @if (confirming()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close()">
        <div
          class="w-full max-w-md rounded-md border border-line bg-popover p-5 shadow-xl"
          role="alertdialog"
          aria-modal="true"
          aria-label="Permanently delete this mailbox?"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-[15px] font-medium">Permanently delete this mailbox?</h3>
          <p class="mt-2 text-[13px] leading-relaxed text-muted">
            This immediately and permanently erases
            <span class="font-medium text-ink">{{ ctx.mailbox()?.address ?? 'the mailbox' }}</span>
            along with its messages, aliases and settings. There is no way to recover this data afterwards.
          </p>
          <div class="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" [class]="ui.outline" [disabled]="busy()" (click)="close()">Cancel</button>
            <button type="button" [class]="ui.danger" [disabled]="busy()" (click)="remove()">
              {{ busy() ? 'Deleting...' : 'Yes, permanently delete' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:keydown.escape)': 'close()',
  },
})
export class DeleteMailbox {
  private readonly api = inject(MailboxApi);
  private readonly router = inject(Router);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected close(): void {
    if (!this.busy()) this.confirming.set(false);
  }

  protected async remove(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.delete(this.ctx.id()));
      await this.router.navigateByUrl(`/domains/${this.ctx.domainId()}/mailboxes`);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not delete mailbox'));
      this.confirming.set(false);
      this.busy.set(false);
    }
  }
}
