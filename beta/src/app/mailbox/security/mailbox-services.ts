import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';
import { UI } from '../../ui';
import { EnabledServices, MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';
import { SwitchRow } from '../shared/switch-row';

const NONE: EnabledServices = { maySend: false, mayReceive: false, mayImap: false, mayPop3: false, maySieve: false, mayDav: false };

/** The current dashboard's MailboxEnabledServicesPage. */
@Component({
  selector: 'amelu-mailbox-services',
  imports: [RouterLink, DitherShader, EmptyState, Icon, MailboxHeading, SaveFeedback, SwitchRow],
  template: `
    <amelu-mailbox-heading title="Enabled services">
      Choose services which should be made available to this mailbox. Please disable unnecessary services in order to
      reduce attack surface.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The services couldn't be loaded" [error]="true" />
      } @else {
        <form class="min-w-0 space-y-6" (submit)="submit($event)">
          <amelu-save-feedback [state]="save" />

          <section>
            <h2 [class]="ui.sectionTitle">Enabled services</h2>
            <div [class]="ui.card + ' divide-y divide-line overflow-hidden'">
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
              <amelu-switch-row label="Calendar and contacts" [disabled]="!loaded()" [checked]="form().mayDav" (checkedChange)="set({ mayDav: $event })">
                Sync calendars and contacts with apps over CalDAV and CardDAV.
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

          <div class="flex items-center gap-3">
            <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
              {{ save.busy() ? 'Saving...' : 'Save changes' }}
            </button>
            @if (changed()) {
              <span class="text-[12px] text-muted">Unsaved changes</span>
            }
          </div>
        </form>
      }

      <aside class="space-y-6">
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="shield" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Less is safer</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            A leaked password can only be used over the services that are on. A mailbox that only receives, like a
            shared inbox read through another mailbox, doesn't need sending or IMAP.
          </p>
          @if (loaded()) {
            <p class="mt-3 text-[12px] text-muted">{{ enabledCount() }} of {{ serviceTotal }} services on for this mailbox.</p>
            <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-bg">
              <div class="h-full rounded-full bg-accent" [style.width.%]="(enabledCount() / serviceTotal) * 100"></div>
            </div>
          }
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Defaults for new mailboxes</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            New mailboxes on this domain start with the domain's
            <a [routerLink]="'/domains/' + ctx.domainId() + '/mailboxes/services'" class="font-medium text-link hover:underline">default services</a>.
            Changes here only affect this mailbox.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Not the same as suspending</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            To switch everything off for a while, suspend the mailbox from its
            <a [routerLink]="ctx.base()" class="font-medium text-link hover:underline">overview</a>
            instead.
          </p>
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
  protected readonly serviceTotal = Object.keys(NONE).length;
  protected readonly enabledCount = computed(() => Object.values(this.form()).filter(Boolean).length);
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
