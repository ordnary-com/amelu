import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi, MailboxLimits as Limits } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

const BYTES_PER_GB = 1024 * 1024 * 1024;

/** The current dashboard's MailboxLimitsPage: caps on stored messages and disk space. */
@Component({
  selector: 'amelu-mailbox-limits',
  imports: [RouterLink, EmptyState, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Mailbox limits">Set absolute resource caps on this mailbox.</amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The limits couldn't be loaded" [error]="true" />
      } @else {
        <form [class]="ui.card + ' space-y-4 p-4'" (submit)="submit($event)">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span [class]="ui.label">Maximum stored messages</span>
              <input
                type="number"
                min="0"
                step="1"
                [class]="ui.input"
                [disabled]="!loaded()"
                [value]="maxEmails()"
                (input)="maxEmails.set($any($event.target).value); save.reset()"
              />
              <span [class]="ui.hint">Messages. 0 for no limit.</span>
            </label>
            <label class="block">
              <span [class]="ui.label">Maximum disk usage</span>
              <input
                type="number"
                min="0"
                step="0.1"
                [class]="ui.input"
                [disabled]="!loaded()"
                [value]="maxDiskGB()"
                (input)="maxDiskGB.set($any($event.target).value); save.reset()"
              />
              <span [class]="ui.hint">Gigabytes. 0 for no limit.</span>
            </label>
          </div>
          <amelu-save-feedback [state]="save" />
          <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
            {{ save.busy() ? 'Saving...' : 'Save changes' }}
          </button>
        </form>
      }

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Totals, not rates</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            These are total caps enforced by the mail cluster itself (total stored messages, total disk space), not a
            daily sending or receiving throughput limit. Use 0 for no limit.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Defaults for new mailboxes</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            New mailboxes on this domain start with the domain's default limits. Changing them here only affects this
            mailbox.
          </p>
          <a [routerLink]="'/domains/' + ctx.domainId() + '/mailboxes/limits'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Default limits
          </a>
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
