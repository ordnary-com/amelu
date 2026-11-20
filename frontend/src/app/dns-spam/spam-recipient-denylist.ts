import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { DnsSpamApi, SpamRecipientDenylist as Denylist, listEntries } from './dns-spam-api';
import { injectSpamForm, spamCrumbs } from './spam-form';
import { SPAM_TABS, SectionTabs } from '../section-tabs';

/** Replaces frontend/src/pages/SpamRecipientDenylistPage.tsx. */
@Component({
  selector: 'amelu-spam-recipient-denylist',
  imports: [SectionTabs, Alert, EmptyState, Icon, PageHeader, RouterLink],
  template: `
    <amelu-page-header title="Spam filtering" [crumbs]="crumbs()">
      Drop every message sent to specific addresses on this domain.
    </amelu-page-header>

    <amelu-section-tabs label="Spam filtering" [base]="'/domains/' + form.id()" [tabs]="tabs" />

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <form class="min-w-0 space-y-5" (submit)="form.submit($event)">
        @if (form.error(); as message) {
          <amelu-alert kind="error" title="The denylist wasn't saved" [dismissible]="true" (dismissed)="form.error.set(null)">
            {{ message }}
          </amelu-alert>
        }
        @if (form.success()) {
          <amelu-alert kind="success" title="Recipient denylist saved" [dismissible]="true" (dismissed)="form.success.set(false)" />
        }

        @if (form.saved() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The denylist couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">
                Blocked recipients
                @if (form.draft()) {
                  <span class="font-normal text-muted">({{ count() }})</span>
                }
              </h2>
            </div>
            <div class="px-5 py-4">
              <label for="recipient-denylist" class="block">
                <span class="block text-[14px]">Recipients</span>
                <span class="mt-0.5 block text-[13px] text-muted">Complete addresses on {{ form.domain()?.name ?? 'this domain' }}</span>
              </label>
              @if (form.draft(); as list) {
                <textarea
                  id="recipient-denylist"
                  rows="8"
                  spellcheck="false"
                  autocapitalize="off"
                  class="mt-2 block w-full rounded-md border bg-surface px-3.5 py-2.5 font-mono text-[13px] leading-relaxed outline-none placeholder:font-sans placeholder:text-[14px] placeholder:text-muted/70 focus:ring-2"
                  [class]="wildcards().length ? 'border-bad focus:ring-bad/25' : 'border-line hover:border-ink/20 focus:border-accent focus:ring-accent/25'"
                  placeholder="List full addresses to block"
                  [value]="list.denylist"
                  (input)="form.update({ denylist: $any($event.target).value })"
                ></textarea>
                @if (wildcards().length) {
                  <p class="mt-1.5 text-[13px] text-bad">
                    Wildcards aren't allowed here. Use complete addresses instead of: {{ wildcards().join(', ') }}
                  </p>
                } @else {
                  <p class="mt-1.5 text-[12px] text-muted">One address per line. {{ count() }} {{ count() === 1 ? 'entry' : 'entries' }}.</p>
                }
              } @else {
                <span class="mt-2 block h-[188px] w-full animate-pulse rounded-md bg-bg" aria-hidden="true"></span>
              }
            </div>
            <p [class]="ui.setNote">
              <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
              <span>This is a hard block: mail to a listed address is dropped and never reaches a Junk folder.</span>
            </p>
            <div class="flex items-center gap-3 border-t border-line px-5 py-3">
              <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="!form.dirty() || form.saving() || wildcards().length > 0">
                {{ form.saving() ? 'Saving...' : 'Save changes' }}
              </button>
              @if (form.dirty()) {
                <span class="text-[13px] text-muted">Unsaved changes</span>
              }
              <a [routerLink]="'/domains/' + form.id() + '/spam'" class="ml-auto text-[13px] text-muted hover:text-ink hover:underline">Cancel</a>
            </div>
          </section>
        }
      </form>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">No wildcards</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Unlike the
              <a [routerLink]="'/domains/' + form.id() + '/spam/sender-lists'" class="text-link hover:underline">sender lists</a>,
              this list doesn't accept wildcards. Enter each address in full.
            </p>
          </div>
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
  protected readonly crumbs = spamCrumbs(this.form);
  protected readonly tabs = SPAM_TABS;

  private readonly entries = computed(() => listEntries(this.form.draft()?.denylist ?? ''));
  protected readonly count = computed(() => this.entries().length);
  // The API rejects these too; catching them here saves a round trip.
  protected readonly wildcards = computed(() => this.entries().filter((entry) => entry.includes('*')));
}
