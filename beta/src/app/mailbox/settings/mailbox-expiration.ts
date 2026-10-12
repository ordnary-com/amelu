import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi, MailboxExpiration as Expiration } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';
import { SwitchRow } from '../shared/switch-row';

/** The current dashboard's MailboxExpirationPage: suspend or erase the mailbox on a set date. */
@Component({
  selector: 'amelu-mailbox-expiration',
  imports: [Alert, EmptyState, MailboxHeading, SaveFeedback, SwitchRow],
  template: `
    <amelu-mailbox-heading title="Mailbox expiration">
      Mailboxes can expire on a specific future date. Use expirations to make temporary addresses. If you choose to
      remove them upon expiry, their data will be permanently erased. Otherwise the mailbox is just suspended.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The expiration couldn't be loaded" [error]="true" />
      } @else {
        <form class="space-y-6" (submit)="submit($event)">
          <div [class]="ui.card + ' overflow-hidden'">
            <amelu-switch-row
              label="Expire mailbox on a given date"
              [disabled]="!loaded()"
              [checked]="enabled()"
              (checkedChange)="enabled.set($event); save.reset()"
            >
              Off means the mailbox never expires.
            </amelu-switch-row>
            @if (enabled()) {
              <label class="block border-b border-line px-4 py-3">
                <span [class]="ui.label">Expiration date</span>
                <input
                  type="date"
                  required
                  [class]="ui.input + ' max-w-56'"
                  [disabled]="!loaded()"
                  [value]="expiresAt()"
                  (input)="expiresAt.set($any($event.target).value); save.reset()"
                />
              </label>
              <amelu-switch-row
                label="Permanently erase this mailbox's data upon expiry"
                [disabled]="!loaded()"
                [checked]="remove()"
                (checkedChange)="remove.set($event); save.reset()"
              >
                Instead of just suspending it.
              </amelu-switch-row>
            }
          </div>

          @if (enabled() && remove()) {
            <amelu-alert kind="warning" title="The data will be gone for good">
              On the expiration date, the mailbox and all its messages are erased. There is no way to recover them.
            </amelu-alert>
          }

          <amelu-save-feedback [state]="save" />
          <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
            {{ save.busy() ? 'Saving...' : 'Save changes' }}
          </button>
        </form>
      }

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Not to the minute</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Checked roughly every 15 minutes, not instantly at the exact moment of expiry.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Good for</h2>
          <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              Event or campaign addresses that are only needed for a while.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              Temporary staff, suspended on their last day.
            </li>
          </ul>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxExpiration {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly loaded = perMailbox((id) => this.api.expiration(id));
  protected readonly enabled = linkedSignal(() => this.loaded()?.expiresAt != null);
  protected readonly expiresAt = linkedSignal(() => this.loaded()?.expiresAt ?? '');
  protected readonly remove = linkedSignal(() => this.loaded()?.removeUponExpiration ?? false);

  private readonly form = computed<Expiration>(() => ({
    expiresAt: this.enabled() ? this.expiresAt() : null,
    removeUponExpiration: this.remove(),
  }));
  protected readonly changed = computed(() => {
    const loaded = this.loaded();
    const form = this.form();
    return !!loaded && (loaded.expiresAt !== form.expiresAt || loaded.removeUponExpiration !== form.removeUponExpiration);
  });
  protected readonly save = new Saving();

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateExpiration(this.ctx.id(), this.form()), 'Could not save expiration');
    if (result) this.loaded.set(result);
  }
}
