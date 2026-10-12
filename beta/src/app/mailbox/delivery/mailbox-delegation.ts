import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxDelegationPage: hand incoming mail to other mailboxes on the domain. */
@Component({
  selector: 'amelu-mailbox-delegation',
  imports: [RouterLink, EmptyState, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Delegations">
      Delegations reassign incoming mail destined for this mailbox to other mailboxes on the same domain, instead of
      also keeping a copy here.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The delegation couldn't be loaded" [error]="true" />
      } @else {
        <form [class]="ui.card + ' space-y-4 p-4'" (submit)="submit($event)">
          <label class="block">
            <span [class]="ui.label">Local recipients{{ domain() ? ' (@' + domain() + ')' : '' }}</span>
            <textarea
              rows="8"
              [class]="ui.input + ' h-auto py-2 font-mono'"
              placeholder="eg. sales"
              [disabled]="!loaded()"
              [value]="delegation()"
              (input)="delegation.set($any($event.target).value); save.reset()"
            ></textarea>
            <span [class]="ui.hint">
              List all desired recipients on your domain, one per line. Only the local part is required: everything after
              the &#64; sign is automatically replaced with your domain, as delegating to other domains isn't possible.
            </span>
          </label>
          <amelu-save-feedback [state]="save" />
          <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
            {{ save.busy() ? 'Saving...' : 'Save changes' }}
          </button>
        </form>
      }

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">No copy is kept</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Once delegated, mail for this address only lands in the mailboxes listed. Leave the list empty to deliver
            here again.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Another domain?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            To send a copy to an address outside this domain, use forwarding.
          </p>
          <a [routerLink]="ctx.base() + '/forwarding'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Forwarding
          </a>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxDelegation {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly loaded = perMailbox((id) => this.api.delegation(id));
  protected readonly delegation = linkedSignal(() => this.loaded()?.delegation ?? '');
  protected readonly changed = computed(() => {
    const loaded = this.loaded();
    return !!loaded && loaded.delegation !== this.delegation();
  });
  protected readonly domain = computed(() => this.ctx.mailbox()?.address.split('@')[1] ?? '');
  protected readonly save = new Saving();

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateDelegation(this.ctx.id(), this.delegation()), 'Could not save delegation');
    if (result) this.loaded.set(result);
  }
}
