import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { EnabledServices, MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';
import { SwitchRow } from '../shared/switch-row';

const NONE: EnabledServices = { maySend: false, mayReceive: false, mayImap: false, mayPop3: false, maySieve: false };

/** The current dashboard's MailboxEnabledServicesPage. */
@Component({
  selector: 'amelu-mailbox-services',
  imports: [RouterLink, EmptyState, MailboxHeading, SaveFeedback, SwitchRow],
  template: `
    <amelu-mailbox-heading title="Enabled services">
      Choose services which should be made available to this mailbox. Please disable unnecessary services in order to
      reduce attack surface.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The services couldn't be loaded" [error]="true" />
      } @else {
        <form class="space-y-6" (submit)="submit($event)">
          <section>
            <h2 [class]="ui.sectionTitle">Enabled services</h2>
            <div [class]="ui.card + ' overflow-hidden'">
              <amelu-switch-row label="May send" [disabled]="!loaded()" [checked]="form().maySend" (checkedChange)="set({ maySend: $event })">
                Send mail over SMTP.
              </amelu-switch-row>
              <amelu-switch-row label="May receive" [disabled]="!loaded()" [checked]="form().mayReceive" (checkedChange)="set({ mayReceive: $event })">
                Accept incoming mail for this address.
              </amelu-switch-row>
              <amelu-switch-row label="May access over IMAP" [disabled]="!loaded()" [checked]="form().mayImap" (checkedChange)="set({ mayImap: $event })">
                Read mail from a mail app, synced across devices.
              </amelu-switch-row>
              <amelu-switch-row label="May access over POP3" [disabled]="!loaded()" [checked]="form().mayPop3" (checkedChange)="set({ mayPop3: $event })">
                Download mail to a single device.
              </amelu-switch-row>
            </div>
          </section>

          <section>
            <h2 [class]="ui.sectionTitle">Sieve filtering</h2>
            <div [class]="ui.card + ' overflow-hidden'">
              <amelu-switch-row label="May access ManageSieve" [disabled]="!loaded()" [checked]="form().maySieve" (checkedChange)="set({ maySieve: $event })">
                Sieve is a programming language that can be used for email filtering. When enabled, custom scripts may be
                managed using the ManageSieve protocol.
              </amelu-switch-row>
            </div>
          </section>

          <amelu-save-feedback [state]="save" />
          <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
            {{ save.busy() ? 'Saving...' : 'Save changes' }}
          </button>
        </form>
      }

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Less is safer</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            A leaked password can only be used over the services that are on. A mailbox that only receives, like a
            shared inbox read through another mailbox, doesn't need sending or IMAP.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Defaults for new mailboxes</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            New mailboxes on this domain start with the domain's default services. Changes here only affect this mailbox.
          </p>
          <a [routerLink]="'/domains/' + ctx.domainId() + '/mailboxes/services'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Default services
          </a>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Not the same as suspending</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            To switch everything off for a while, suspend the mailbox from its overview instead.
          </p>
          <a [routerLink]="ctx.base()" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">Overview</a>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxServices {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly loaded = perMailbox((id) => this.api.services(id));
  protected readonly form = linkedSignal(() => this.loaded() ?? NONE);
  protected readonly changed = computed(() => {
    const loaded = this.loaded();
    const form = this.form();
    return !!loaded && (Object.keys(NONE) as (keyof EnabledServices)[]).some((key) => loaded[key] !== form[key]);
  });
  protected readonly save = new Saving();

  protected set(patch: Partial<EnabledServices>): void {
    this.form.update((form) => ({ ...form, ...patch }));
    this.save.reset();
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateServices(this.ctx.id(), this.form()), 'Could not update services');
    if (result) this.loaded.set(result);
  }
}
