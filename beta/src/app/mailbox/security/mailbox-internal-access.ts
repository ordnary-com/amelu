import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';
import { SwitchRow } from '../shared/switch-row';

/** The current dashboard's MailboxInternalAccessPage ("Private Internal Mailbox"). */
@Component({
  selector: 'amelu-mailbox-internal-access',
  imports: [RouterLink, EmptyState, MailboxHeading, SaveFeedback, SwitchRow],
  template: `
    <amelu-mailbox-heading title="Private internal mailbox">
      A mailbox can be restricted to receive messages only from other mailboxes on this domain. No external message
      would be accepted.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The setting couldn't be loaded" [error]="true" />
      } @else {
        <form class="space-y-6" (submit)="submit($event)">
          <div [class]="ui.card + ' overflow-hidden'">
            <amelu-switch-row
              label="Internal access only"
              [disabled]="!loaded()"
              [checked]="internalOnly()"
              (checkedChange)="internalOnly.set($event); save.reset()"
            >
              Only mail from other mailboxes on {{ domain() }} is accepted.
            </amelu-switch-row>
          </div>

          <amelu-save-feedback [state]="save" />
          <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
            {{ save.busy() ? 'Saving...' : 'Save changes' }}
          </button>
        </form>
      }

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">When to use it</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Use this feature to set up an internal, private mailbox. Use the domain's denylists and junklists for even
            finer control.
          </p>
          <a [routerLink]="'/domains/' + ctx.domainId() + '/spam'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Spam filtering
          </a>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxInternalAccess {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly loaded = perMailbox((id) => this.api.internalAccess(id));
  protected readonly internalOnly = linkedSignal(() => this.loaded()?.internalAccessOnly ?? false);
  protected readonly changed = computed(() => {
    const loaded = this.loaded();
    return !!loaded && loaded.internalAccessOnly !== this.internalOnly();
  });
  protected readonly domain = computed(() => this.ctx.mailbox()?.address.split('@')[1] ?? 'this domain');
  protected readonly save = new Saving();

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateInternalAccess(this.ctx.id(), this.internalOnly()), 'Could not update setting');
    if (result) this.loaded.set(result);
  }
}
