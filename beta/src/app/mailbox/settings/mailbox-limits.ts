import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { formatBytes } from '../../format-bytes';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';
import { UI } from '../../ui';
import { MailboxApi, MailboxLimits as Limits } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

const BYTES_PER_GB = 1024 * 1024 * 1024;

/** The current dashboard's MailboxLimitsPage: caps on stored messages and disk space. */
@Component({
  selector: 'amelu-mailbox-limits',
  imports: [RouterLink, DitherShader, EmptyState, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Mailbox limits">Set absolute resource caps on this mailbox.</amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The limits couldn't be loaded" [error]="true" />
      } @else {
        <form class="min-w-0 space-y-6" (submit)="submit($event)">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="rounded-lg border border-line bg-surface px-4 pt-3 pb-3.5">
              <span class="block text-[12px] text-muted">Stored messages</span>
              @if (loaded(); as l) {
                <span class="mt-1 block text-[26px] leading-tight font-normal tracking-[-0.01em]">
                  @if (l.maxEmails) {
                    <span class="text-[13px] tracking-normal text-muted">up to</span> {{ l.maxEmails.toLocaleString('en-GB') }}
                  } @else {
                    No limit
                  }
                </span>
              } @else {
                <span class="mt-2.5 block h-6 w-20 animate-pulse rounded bg-bg"></span>
              }
            </div>
            <div class="rounded-lg border border-line bg-surface px-4 pt-3 pb-3.5">
              <span class="block text-[12px] text-muted">Disk usage</span>
              @if (loaded(); as l) {
                <span class="mt-1 block text-[26px] leading-tight font-normal tracking-[-0.01em]">
                  @if (l.maxDiskQuotaBytes) {
                    <span class="text-[13px] tracking-normal text-muted">up to</span> {{ bytes(l.maxDiskQuotaBytes) }}
                  } @else {
                    No limit
                  }
                </span>
              } @else {
                <span class="mt-2.5 block h-6 w-20 animate-pulse rounded bg-bg"></span>
              }
            </div>
          </div>

          <section>
            <h2 [class]="ui.sectionTitle">Limits for this mailbox</h2>
            <div [class]="ui.card + ' space-y-4 p-4'">
              <div class="grid gap-5 sm:grid-cols-2">
                <label class="block">
                  <span [class]="ui.label">Maximum stored messages</span>
                  <span class="relative block">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputmode="numeric"
                      [class]="ui.input + ' pr-20'"
                      [disabled]="!loaded()"
                      [value]="maxEmails()"
                      (input)="maxEmails.set($any($event.target).value); save.reset()"
                    />
                    <span class="pointer-events-none absolute top-1/2 right-2.5 mt-[3px] -translate-y-1/2 text-[12px] text-muted">messages</span>
                  </span>
                  <span [class]="ui.hint + ' block'">0 for no limit.</span>
                </label>
                <label class="block">
                  <span [class]="ui.label">Maximum disk usage</span>
                  <span class="relative block">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      inputmode="decimal"
                      [class]="ui.input + ' pr-12'"
                      [disabled]="!loaded()"
                      [value]="maxDiskGB()"
                      (input)="maxDiskGB.set($any($event.target).value); save.reset()"
                    />
                    <span class="pointer-events-none absolute top-1/2 right-2.5 mt-[3px] -translate-y-1/2 text-[12px] text-muted">GB</span>
                  </span>
                  <span [class]="ui.hint + ' block'">In gigabytes. 0 for no limit.</span>
                </label>
              </div>
              <amelu-save-feedback [state]="save" />
              <div class="-mx-4 -mb-4 flex items-center justify-end gap-3 border-t border-line bg-bg/40 px-4 py-3">
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
          <amelu-icon name="inbox" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Totals, not rates</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            These are total caps enforced by the mail cluster itself (total stored messages, total disk space), not a
            daily sending or receiving throughput limit. Use 0 for no limit.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Defaults for new mailboxes</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            New mailboxes on this domain start with the domain's
            <a [routerLink]="'/domains/' + ctx.domainId() + '/mailboxes/limits'" class="font-medium text-link hover:underline">default limits</a>.
            Changing them here only affects this mailbox.
          </p>
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

  protected readonly loaded = perMailbox((id) => this.api.limits(id));
  protected readonly maxEmails = linkedSignal(() => String(this.loaded()?.maxEmails ?? 0));
  protected readonly maxDiskGB = linkedSignal(() => toGB(this.loaded()?.maxDiskQuotaBytes ?? 0));

  private readonly form = computed<Limits>(() => ({
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
