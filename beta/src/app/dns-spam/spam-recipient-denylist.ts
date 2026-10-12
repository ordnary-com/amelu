import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { DnsSpamApi, SpamRecipientDenylist as Denylist, listEntries } from './dns-spam-api';
import { injectSpamForm, spamCrumbs } from './spam-form';

/** Replaces frontend/src/pages/SpamRecipientDenylistPage.tsx. */
@Component({
  selector: 'amelu-spam-recipient-denylist',
  imports: [Alert, EmptyState, PageHeader, RouterLink],
  template: `
    <amelu-page-header title="Recipient denylist" [crumbs]="crumbs()">
      Any message with a recipient address that matches an entry in this denylist is silently dropped. Use it to block
      messages sent to specific addresses on your domain.
    </amelu-page-header>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <form class="min-w-0 space-y-4" (submit)="form.submit($event)">
        @if (form.error(); as message) {
          <amelu-alert kind="error" title="The denylist wasn't saved" [dismissible]="true" (dismissed)="form.error.set(null)">
            {{ message }}
          </amelu-alert>
        }
        @if (form.success()) {
          <amelu-alert kind="success" title="Recipient denylist saved" [dismissible]="true" (dismissed)="form.success.set(false)" />
        }

        <section>
          <h2 [class]="ui.sectionTitle">Blocked recipients</h2>
          <div [class]="ui.card + ' p-4'">
            @if (form.draft(); as list) {
              <label for="recipient-denylist" [class]="ui.label">Recipients (complete addresses)</label>
              <textarea
                id="recipient-denylist"
                rows="8"
                spellcheck="false"
                autocapitalize="off"
                class="mt-1.5 w-full rounded-md border bg-transparent px-2.5 py-2 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-muted focus:ring-2"
                [class]="wildcards().length ? 'border-bad focus:ring-bad/30' : 'border-line focus:border-accent focus:ring-accent/30'"
                placeholder="List full addresses to block"
                [value]="list.denylist"
                (input)="form.update({ denylist: $any($event.target).value })"
              ></textarea>
              @if (wildcards().length) {
                <p class="mt-1 text-[12px] text-bad">
                  Wildcards aren't allowed here. Use complete addresses instead of: {{ wildcards().join(', ') }}
                </p>
              } @else {
                <p [class]="ui.hint">One address per line. {{ count() }} {{ count() === 1 ? 'entry' : 'entries' }}.</p>
              }
            } @else if (form.saved() === null) {
              <amelu-empty-state title="The denylist couldn't be loaded" [error]="true" />
            } @else {
              <div class="space-y-3" aria-hidden="true">
                <span class="block h-3 w-48 animate-pulse rounded bg-bg"></span>
                <span class="block h-40 w-full animate-pulse rounded bg-bg"></span>
              </div>
            }
          </div>
        </section>

        <div class="flex items-center gap-3">
          <button type="submit" [class]="ui.primary" [disabled]="!form.dirty() || form.saving() || wildcards().length > 0">
            {{ form.saving() ? 'Saving...' : 'Save changes' }}
          </button>
          <a [routerLink]="'/domains/' + form.id() + '/spam'" class="text-[13px] font-medium text-muted hover:text-ink hover:underline">Cancel</a>
        </div>
      </form>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">A hard block</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            An entry in this list is a hard block, without a possibility to reach your Junk folder.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">No wildcards</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Unlike with the
            <a [routerLink]="'/domains/' + form.id() + '/spam/sender-lists'" class="text-link hover:underline">sender lists</a>,
            you cannot use wildcards here but have to specify complete, specific addresses.
          </p>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SpamRecipientDenylist {
  private readonly api = inject(DnsSpamApi);
  protected readonly ui = UI;

  protected readonly form = injectSpamForm<Denylist>({
    load: (id) => this.api.spamRecipientDenylist(id),
    save: (id, value) => this.api.updateSpamRecipientDenylist(id, value),
    saveError: 'Could not save recipient denylist',
  });
  protected readonly crumbs = spamCrumbs(this.form, 'Recipient denylist');

  private readonly entries = computed(() => listEntries(this.form.draft()?.denylist ?? ''));
  protected readonly count = computed(() => this.entries().length);
  // The API rejects these too; catching them here saves a round trip.
  protected readonly wildcards = computed(() => this.entries().filter((entry) => entry.includes('*')));
}
