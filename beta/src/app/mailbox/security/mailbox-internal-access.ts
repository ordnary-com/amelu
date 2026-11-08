import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';
import { SwitchRow } from '../shared/switch-row';

/** The current dashboard's MailboxInternalAccessPage ("Private Internal Mailbox"). */
@Component({
  selector: 'amelu-mailbox-internal-access',
  imports: [RouterLink, DitherShader, EmptyState, Icon, MailboxHeading, SaveFeedback, SwitchRow],
  template: `
    <amelu-mailbox-heading title="Private internal mailbox">
      A mailbox can be restricted to receive messages only from other mailboxes on this domain. No external message
      would be accepted.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The setting couldn't be loaded" [error]="true" />
      } @else {
        <form class="min-w-0 space-y-4" (submit)="submit($event)">
          <amelu-save-feedback [state]="save" />
          <section>
            <h2 [class]="ui.sectionTitle">Incoming mail</h2>
            <div [class]="ui.card + ' overflow-hidden'">
              <amelu-switch-row
                label="Internal access only"
                [disabled]="!loaded()"
                [checked]="internalOnly()"
                (checkedChange)="internalOnly.set($event); save.reset()"
              >
                Only mail from other mailboxes on {{ domain() }} is accepted.
              </amelu-switch-row>
              <div class="flex items-center justify-end gap-3 border-t border-line bg-bg/40 px-4 py-3">
                @if (changed()) {
                  <span class="mr-auto text-[12px] text-muted">Unsaved changes</span>
                }
                <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
                  {{ save.busy() ? 'Saving...' : 'Save changes' }}
                </button>
              </div>
            </div>
          </section>
        </form>
      }

      <aside class="space-y-6">
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="shield" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">When to use it</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Use this feature to set up an internal, private mailbox. Use the domain's denylists and junklists for even
            finer control.
          </p>
          <a [routerLink]="'/domains/' + ctx.domainId() + '/spam'" [class]="ui.outline + ' mt-3'">Spam filtering</a>
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
