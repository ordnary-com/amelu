import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { formatBytes } from '../../format-bytes';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxApi, MailboxLimits as Limits } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

const BYTES_PER_GB = 1024 * 1024 * 1024;

/** The current dashboard's MailboxLimitsPage: caps on stored messages and disk space. */
@Component({
  selector: 'amelu-mailbox-limits',
  imports: [RouterLink, EmptyState, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Mailbox limits">How much this mailbox may hold in total.</amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <form class="min-w-0 space-y-5" (submit)="submit($event)">
        <amelu-save-feedback [state]="save" success="Limits saved." />

        @if (loaded() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The limits couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Limits for this mailbox</h2>
            </div>
            <div class="grid gap-5 px-5 py-4 sm:grid-cols-2">
              <label class="block">
                <span class="block text-[14px]">Stored messages</span>
                @if (loaded()) {
                  <span [class]="unitBox">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputmode="numeric"
                      [class]="unitInput"
                      [value]="maxEmails()"
                      (input)="maxEmails.set($any($event.target).value); save.reset()"
                    />
                    <span [class]="unit">messages</span>
                  </span>
                } @else {
                  <span class="mt-2 block h-11 animate-pulse rounded-md bg-bg" aria-hidden="true"></span>
                }
                <span class="mt-1.5 block text-[12px] text-muted">
                  {{ form().maxEmails === 0 ? 'No limit.' : 'The most messages this mailbox may hold.' }}
                </span>
              </label>
              <label class="block">
                <span class="block text-[14px]">Disk space</span>
                @if (loaded()) {
                  <span [class]="unitBox">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      inputmode="decimal"
                      [class]="unitInput"
                      [value]="maxDiskGB()"
                      (input)="maxDiskGB.set($any($event.target).value); save.reset()"
                    />
                    <span [class]="unit">GB</span>
                  </span>
                } @else {
                  <span class="mt-2 block h-11 animate-pulse rounded-md bg-bg" aria-hidden="true"></span>
                }
                <span class="mt-1.5 block text-[12px] text-muted">
                  {{ form().maxDiskQuotaBytes === 0 ? 'No limit.' : 'The most disk space this mailbox may use.' }}
                </span>
              </label>
            </div>
            <p [class]="ui.setNote">
              <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
              <span>These are totals the mail server enforces, not a daily sending or receiving limit. Use 0 for no limit.</span>
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
            <h2 [class]="ui.panelTitle">Saved limits</h2>
          </div>
          <div [class]="ui.well">
            <dl class="space-y-1.5 rounded border border-line bg-surface px-3.5 py-3 text-[13px]">
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-muted">Stored messages</dt>
                <dd class="font-medium tabular-nums">
                  @if (loaded(); as l) {
                    {{ l.maxEmails ? 'Up to ' + l.maxEmails.toLocaleString('en-GB') : 'No limit' }}
                  } @else {
                    <span class="inline-block h-3.5 w-16 animate-pulse rounded bg-bg align-middle"></span>
                  }
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-muted">Disk space</dt>
                <dd class="font-medium tabular-nums">
                  @if (loaded(); as l) {
                    {{ l.maxDiskQuotaBytes ? 'Up to ' + bytes(l.maxDiskQuotaBytes) : 'No limit' }}
                  } @else {
                    <span class="inline-block h-3.5 w-16 animate-pulse rounded bg-bg align-middle"></span>
                  }
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">New mailboxes</h2>
            <a [routerLink]="'/domains/' + ctx.domainId() + '/mailboxes/limits'" class="text-[13px] text-link hover:underline">Default limits</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              New mailboxes on this domain start with the domain's default limits. Changes here only affect this mailbox.
            </p>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxLimits {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;
  protected readonly bytes = formatBytes;

  protected readonly unitBox =
    'mt-2 flex h-11 items-center rounded-md border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25';
  protected readonly unitInput = 'h-full w-full min-w-0 bg-transparent pl-3.5 text-[15px] tabular-nums outline-none';
  protected readonly unit = 'flex-none pr-3.5 pl-2 text-[14px] text-muted select-none';

  protected readonly loaded = perMailbox((id) => this.api.limits(id));
  protected readonly maxEmails = linkedSignal(() => String(this.loaded()?.maxEmails ?? 0));
  protected readonly maxDiskGB = linkedSignal(() => toGB(this.loaded()?.maxDiskQuotaBytes ?? 0));

  protected readonly form = computed<Limits>(() => ({
    maxEmails: Math.max(0, Math.round(Number(this.maxEmails()) || 0)),
    maxDiskQuotaBytes: Math.max(0, Math.round((Number(this.maxDiskGB()) || 0) * BYTES_PER_GB)),
  }));
  protected readonly changed = computed(() => {
    const loaded = this.loaded();
    const form = this.form();
    return !!loaded && (loaded.maxEmails !== form.maxEmails || loaded.maxDiskQuotaBytes !== form.maxDiskQuotaBytes);
  });
  protected readonly save = new Saving();

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateLimits(this.ctx.id(), this.form()), 'Could not save limits');
    if (result) this.loaded.set(result);
  }
}

function toGB(bytes: number): string {
  return bytes === 0 ? '0' : String(bytes / BYTES_PER_GB);
}
