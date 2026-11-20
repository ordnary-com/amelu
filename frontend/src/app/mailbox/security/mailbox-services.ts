import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { EnabledServices, MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

type ServiceKey = keyof EnabledServices;

const NONE: EnabledServices = { maySend: false, mayReceive: false, mayImap: false, mayPop3: false, maySieve: false, mayDav: false };

/** The current dashboard's MailboxEnabledServicesPage. */
@Component({
  selector: 'amelu-mailbox-services',
  imports: [RouterLink, EmptyState, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Enabled services">
      Choose which services this mailbox can use. Turn off the ones it doesn't need.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <form class="min-w-0 space-y-5" (submit)="submit($event)">
        <amelu-save-feedback [state]="save" success="Services saved." />

        @if (loaded() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The services couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Services for this mailbox</h2>
              @if (loaded()) {
                <span class="text-[13px] text-muted tabular-nums">{{ enabledCount() }} of {{ serviceTotal }} on</span>
              }
            </div>
            <ul class="divide-y divide-line">
              @for (service of services; track service.key) {
                <li class="flex items-center gap-4 px-5 py-3.5">
                  <span class="min-w-0 flex-1">
                    <span class="block text-[14px]">{{ service.label }}</span>
                    <span class="mt-0.5 block text-[13px] text-muted">{{ service.hint }}</span>
                  </span>
                  @if (loaded()) {
                    <button
                      type="button"
                      role="switch"
                      [class]="switchClass"
                      [class.bg-accent]="form()[service.key]"
                      [class.bg-line]="!form()[service.key]"
                      [attr.aria-checked]="form()[service.key]"
                      [attr.aria-label]="service.label"
                      (click)="toggle(service.key)"
                    >
                      <span class="size-5 rounded-full bg-white shadow-sm transition-transform" [class]="form()[service.key] ? 'translate-x-[18px]' : 'translate-x-0.5'"></span>
                    </button>
                  } @else {
                    <span class="h-6 w-10 flex-none animate-pulse rounded-full bg-bg" aria-hidden="true"></span>
                  }
                </li>
              }
            </ul>
            @if (loaded() && !form().maySend && !form().mayReceive) {
              <p class="flex gap-2.5 border-t border-line bg-warn/10 px-5 py-3 text-[13px] leading-relaxed text-warn">
                <amelu-icon name="circleAlert" [size]="16" class="mt-0.5 flex-none" />
                <span>With sending and receiving both off, this mailbox can't be used for email.</span>
              </p>
            }
            <div class="flex items-center gap-3 border-t border-line bg-well px-5 py-3">
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
            <h2 [class]="ui.panelTitle">Less is safer</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              A leaked password only works over the services that are on. A mailbox that only receives, like a shared
              inbox read through another mailbox, doesn't need sending or IMAP.
            </p>
            @if (loaded()) {
              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-bg">
                <div class="h-full rounded-full bg-accent" [style.width.%]="(enabledCount() / serviceTotal) * 100"></div>
              </div>
              <p class="mt-1.5 text-[12px] text-muted tabular-nums">{{ enabledCount() }} of {{ serviceTotal }} services on</p>
            }
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">New mailboxes</h2>
            <a [routerLink]="'/domains/' + ctx.domainId() + '/mailboxes/services'" class="text-[13px] text-link hover:underline">Default services</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              New mailboxes on this domain start with the domain's default services. Changes here only affect this mailbox.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Not the same as suspending</h2>
            <a [routerLink]="ctx.base()" class="text-[13px] text-link hover:underline">Overview</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              To switch everything off for a while, suspend the mailbox from its overview instead.
            </p>
          </div>
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

  protected readonly services: { key: ServiceKey; label: string; hint: string }[] = [
    { key: 'maySend', label: 'May send', hint: 'Send mail over SMTP.' },
    { key: 'mayReceive', label: 'May receive', hint: 'Accept incoming mail for this address.' },
    { key: 'mayImap', label: 'May access over IMAP', hint: 'Read mail in a mail app, kept in sync across devices.' },
    { key: 'mayPop3', label: 'May access over POP3', hint: 'Download mail to a single device.' },
    { key: 'mayDav', label: 'Calendar and contacts', hint: 'Sync calendars and contacts with apps over CalDAV and CardDAV.' },
    { key: 'maySieve', label: 'ManageSieve', hint: 'Lets mail apps manage the Sieve scripts that filter this mailbox.' },
  ];
  protected readonly switchClass =
    'relative inline-flex h-6 w-10 flex-none cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none';

  protected readonly loaded = perMailbox((id) => this.api.services(id));
  protected readonly form = linkedSignal(() => this.loaded() ?? NONE);
  protected readonly changed = computed(() => {
    const loaded = this.loaded();
    const form = this.form();
    return !!loaded && (Object.keys(NONE) as ServiceKey[]).some((key) => loaded[key] !== form[key]);
  });
  protected readonly serviceTotal = Object.keys(NONE).length;
  protected readonly enabledCount = computed(() => Object.values(this.form()).filter(Boolean).length);
  protected readonly save = new Saving();

  protected set(patch: Partial<EnabledServices>): void {
    this.form.update((form) => ({ ...form, ...patch }));
    this.save.reset();
  }

  protected toggle(key: ServiceKey): void {
    this.set({ [key]: !this.form()[key] });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateServices(this.ctx.id(), this.form()), 'Could not update services');
    if (result) this.loaded.set(result);
  }
}
