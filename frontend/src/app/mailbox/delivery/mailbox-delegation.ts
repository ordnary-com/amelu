import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxDelegationPage: hand incoming mail to other mailboxes on the domain. */
@Component({
  selector: 'amelu-mailbox-delegation',
  imports: [RouterLink, EmptyState, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Delegations">
      Hand incoming mail for this mailbox to other mailboxes on the same domain, without keeping a copy here.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state class="rounded border border-line bg-surface" title="The delegation couldn't be loaded" [error]="true" [compact]="true" />
      } @else {
        <form class="min-w-0 space-y-5" (submit)="submit($event)">
          <amelu-save-feedback [state]="save" />

          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Delegate to</h2>
              @if (loaded()) {
                <span class="text-[13px] text-muted tabular-nums">
                  @if (recipientCount()) {
                    {{ recipientCount() }} {{ recipientCount() === 1 ? 'recipient' : 'recipients' }}
                  } @else {
                    Off
                  }
                </span>
              }
            </div>

            <div class="px-5 py-4">
              <label for="delegation-recipients" class="block text-[14px]">Local recipients{{ domain() ? ' (@' + domain() + ')' : '' }}</label>
              <textarea
                id="delegation-recipients"
                rows="8"
                class="mt-2 block w-full rounded-md border border-line bg-surface px-3.5 py-2.5 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
                placeholder="sales"
                spellcheck="false"
                autocapitalize="off"
                [disabled]="!loaded()"
                [value]="delegation()"
                (input)="delegation.set($any($event.target).value); save.reset()"
              ></textarea>
              <p class="mt-1.5 text-[12px] text-muted">
                One per line. Only the part before the &#64; is needed: the rest is always replaced with your domain.
              </p>

              @if (loaded()) {
                <!-- Where mail for this mailbox goes, as it would be saved now. -->
                <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-well px-4 py-3 text-[13px]">
                  <span class="font-mono text-[12px] text-muted">{{ ctx.mailbox()?.address ?? 'This mailbox' }}</span>
                  <amelu-icon name="arrowRight" [size]="15" class="text-muted" />
                  @for (target of targets(); track $index) {
                    <span class="inline-flex min-w-0 items-center gap-1.5 font-medium"><amelu-icon name="inbox" [size]="15" class="flex-none text-link" /><span class="truncate">{{ target }}</span></span>
                  } @empty {
                    <span class="inline-flex items-center gap-1.5 font-medium"><amelu-icon name="inbox" [size]="15" class="flex-none text-link" />Delivered to this mailbox</span>
                  }
                  @if (changed()) {
                    <span class="ml-auto text-[12px] text-muted">Not saved yet</span>
                  }
                </div>
              }
            </div>

            <p [class]="ui.setNote">
              <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
              <span>No copy is kept here: delegated mail only lands in the mailboxes listed. Leave the list empty to deliver here again.</span>
            </p>

            <div class="flex items-center gap-3 border-t border-line px-5 py-3">
              <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="save.busy() || !changed()">
                {{ save.busy() ? 'Saving...' : 'Save changes' }}
              </button>
              @if (changed()) {
                <span class="text-[13px] text-muted">Unsaved changes</span>
              }
            </div>
          </section>
        </form>
      }

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Another domain?</h2>
            <a [routerLink]="ctx.base() + '/forwarding'" class="text-[13px] text-link hover:underline">Forwarding</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Delegating to other domains isn't possible. To send a copy to an address outside this domain, use forwarding.
            </p>
          </div>
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
  protected readonly recipientCount = computed(() => this.delegation().split('\n').filter((line) => line.trim()).length);
  // The listed recipients as full addresses, for the preview: the part after an @ becomes this domain.
  protected readonly targets = computed(() =>
    this.delegation()
      .split('\n')
      .map((line) => line.trim().split('@')[0].trim())
      .filter((local) => local)
      .map((local) => (this.domain() ? local + '@' + this.domain() : local)),
  );
  protected readonly save = new Saving();

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateDelegation(this.ctx.id(), this.delegation()), 'Could not save delegation');
    if (result) this.loaded.set(result);
  }
}
