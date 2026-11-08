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
    <amelu-mailbox-heading title="Delete mailbox">
      This permanently removes the mailbox from the mail cluster. This cannot be undone.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        @if (error(); as message) {
          <amelu-alert kind="error" title="The mailbox wasn't deleted" [dismissible]="true" (dismissed)="error.set(null)">
            {{ message }}
          </amelu-alert>
        }
        <section>
          <h2 [class]="ui.sectionTitle">Delete {{ ctx.mailbox()?.address ?? 'this mailbox' }}</h2>
          <div [class]="ui.card + ' p-4'">
            <p class="text-[13px] leading-relaxed">
              Deleting a mailbox permanently removes it from the mail cluster, along with everything stored in it.
            </p>
            <ul class="-mx-4 mt-4 divide-y divide-line border-t border-line" aria-label="What deleting does">
              <li class="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span class="inline-flex size-5 flex-none items-center justify-center rounded-full bg-bad/15 text-bad" aria-hidden="true">
                  <amelu-icon name="close" [size]="12" />
                </span>
                Every message in it is erased.
              </li>
              <li class="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span class="inline-flex size-5 flex-none items-center justify-center rounded-full bg-bad/15 text-bad" aria-hidden="true">
                  <amelu-icon name="close" [size]="12" />
                </span>
                Its aliases and settings are erased.
              </li>
              <li class="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span class="inline-flex size-5 flex-none items-center justify-center rounded-full bg-bad/15 text-bad" aria-hidden="true">
                  <amelu-icon name="close" [size]="12" />
                </span>
                Mail sent to the address bounces from then on.
              </li>
              <li class="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span class="inline-flex size-5 flex-none items-center justify-center rounded-full bg-bad/15 text-bad" aria-hidden="true">
                  <amelu-icon name="close" [size]="12" />
                </span>
                This cannot be undone, and the data can't be recovered.
              </li>
            </ul>
            <div class="-mx-4 -mb-4 flex justify-end border-t border-line bg-bg/40 px-4 py-3">
              <button type="button" [class]="ui.dangerOutline" [disabled]="!ctx.mailbox()" (click)="confirming.set(true)">
                Delete this mailbox
              </button>
            </div>
          </div>
        </section>
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Only need a break?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            <a [routerLink]="ctx.base()" class="font-medium text-link hover:underline">Suspending</a>
            stops all mail and sign-ins but keeps everything, so it can be undone. An
            <a [routerLink]="ctx.base() + '/expiration'" class="font-medium text-link hover:underline">expiration date</a>
            can do either automatically later.
          </p>
        </section>
      </aside>
    </div>

    @if (confirming()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close()">
        <div
          class="w-full max-w-md rounded-lg border border-line bg-popover p-5 shadow-xl"
          role="alertdialog"
          aria-modal="true"
          aria-label="Permanently delete this mailbox?"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-[15px] font-bold">Permanently delete this mailbox?</h3>
          <p class="mt-2 text-[13px] leading-relaxed text-muted">
            This immediately and permanently erases the mailbox along with its messages, aliases, and settings. There is
            no way to recover this data afterwards.
          </p>
          <div class="mt-5 flex justify-end gap-2">
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
