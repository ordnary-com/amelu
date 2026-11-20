import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { badgeClass } from '../../status';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxInternalAccessPage ("Private Internal Mailbox"). */
@Component({
  selector: 'amelu-mailbox-internal-access',
  imports: [RouterLink, EmptyState, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Private internal mailbox">
      Only accept mail from other mailboxes on this domain, and turn away everything from outside.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <form class="min-w-0 space-y-5" (submit)="submit($event)">
        <amelu-save-feedback [state]="save" success="Setting saved." />

        @if (loaded() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The setting couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Incoming mail</h2>
              @if (loaded(); as l) {
                <span [class]="l.internalAccessOnly ? badge.warn : badge.neutral">{{ l.internalAccessOnly ? 'Internal only' : 'Open to everyone' }}</span>
              }
            </div>
            <div class="flex items-center gap-4 px-5 py-3.5">
              <span class="min-w-0 flex-1">
                <span id="internal-label" class="block text-[14px]">Internal access only</span>
                <span class="mt-0.5 block text-[13px] text-muted">Only mail from other mailboxes on {{ domain() }} is accepted.</span>
              </span>
              @if (loaded()) {
                <button
                  type="button"
                  role="switch"
                  aria-labelledby="internal-label"
                  [attr.aria-checked]="internalOnly()"
                  class="relative inline-flex h-6 w-10 flex-none cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                  [class]="internalOnly() ? 'bg-accent' : 'bg-line'"
                  (click)="internalOnly.set(!internalOnly()); save.reset()"
                >
                  <span class="size-5 rounded-full bg-white shadow-sm transition-transform" [class]="internalOnly() ? 'translate-x-[18px]' : 'translate-x-0.5'"></span>
                </button>
              } @else {
                <span class="h-6 w-10 flex-none animate-pulse rounded-full bg-bg" aria-hidden="true"></span>
              }
            </div>
            <p [class]="ui.setNote">
              <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
              <span>Mail from any address outside {{ domain() }} is refused while this is on. Sending is not affected.</span>
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
        }
      </form>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">When to use it</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              For a mailbox that should only hear from colleagues, like an internal helpdesk or a team inbox.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Finer control</h2>
            <a [routerLink]="'/domains/' + ctx.domainId() + '/spam'" class="text-[13px] text-link hover:underline">Spam filtering</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              To block or flag only certain senders, use the domain's denylists and junklists instead.
            </p>
          </div>
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
  protected readonly badge = { warn: badgeClass('warn'), neutral: badgeClass('neutral') };

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
