import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { DnsSpamApi, SpamSenderLists as Lists, listEntries } from './dns-spam-api';
import { injectSpamForm, spamCrumbs } from './spam-form';
import { SPAM_TABS, SectionTabs } from '../section-tabs';

/** Replaces frontend/src/pages/SpamSenderListsPage.tsx. */
@Component({
  selector: 'amelu-spam-sender-lists',
  imports: [SectionTabs, Alert, EmptyState, Icon, PageHeader, RouterLink],
  template: `
    <amelu-page-header title="Spam filtering" [crumbs]="crumbs()">
      Drop or junk mail from specific senders, whatever its spam score.
    </amelu-page-header>

    <amelu-section-tabs label="Spam filtering" [base]="'/domains/' + form.id()" [tabs]="tabs" />

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <form class="min-w-0 space-y-5" (submit)="form.submit($event)">
        @if (form.error(); as message) {
          <amelu-alert kind="error" title="The lists weren't saved" [dismissible]="true" (dismissed)="form.error.set(null)">
            {{ message }}
          </amelu-alert>
        }
        @if (form.success()) {
          <amelu-alert kind="success" title="Sender lists saved" [dismissible]="true" (dismissed)="form.success.set(false)" />
        }

        @if (form.saved() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The sender lists couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Sender lists</h2>
              @if (form.draft()) {
                <span class="text-[13px] text-muted tabular-nums">{{ total() }} {{ total() === 1 ? 'entry' : 'entries' }}</span>
              }
            </div>
            <div class="divide-y divide-line">
              @for (list of fields; track list.key) {
                <div class="px-5 py-4">
                  <label [for]="'spam-' + list.key" class="block">
                    <span class="block text-[14px]">{{ list.title }} <span class="text-muted tabular-nums">({{ counts()[list.key] }})</span></span>
                    <span class="mt-0.5 block text-[13px] text-muted">{{ list.label }}</span>
                  </label>
                  @if (form.draft(); as lists) {
                    <textarea
                      [id]="'spam-' + list.key"
                      rows="8"
                      spellcheck="false"
                      autocapitalize="off"
                      class="mt-2 block w-full rounded-md border border-line bg-surface px-3.5 py-2.5 font-mono text-[13px] leading-relaxed outline-none placeholder:font-sans placeholder:text-[14px] placeholder:text-muted/70 hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/25"
                      placeholder="Email addresses or wildcard rules, e.g. *@domain.com"
                      [value]="lists[list.key]"
                      (input)="set(list.key, $any($event.target).value)"
                    ></textarea>
                  } @else {
                    <span class="mt-2 block h-[188px] w-full animate-pulse rounded-md bg-bg" aria-hidden="true"></span>
                  }
                  <p class="mt-1.5 text-[12px] text-muted">
                    One per line. {{ counts()[list.key] }} {{ counts()[list.key] === 1 ? 'entry' : 'entries' }}.
                  </p>
                </div>
              }
            </div>
            <p [class]="ui.setNote">
              <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
              <span>A sender on both lists goes to Junk: the junklist takes precedence over the denylist.</span>
            </p>
            <div class="flex items-center gap-3 border-t border-line px-5 py-3">
              <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="!form.dirty() || form.saving()">
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
            <h2 [class]="ui.panelTitle">Wildcards</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Use an asterisk to match many senders at once, such as
              <code class="font-mono text-ink">*&#64;domain.com</code>, <code class="font-mono text-ink">spam&#64;*.ru</code> or even
              <code class="font-mono text-ink">*&#64;*.br</code>. Keep rules as specific as you can, so wanted mail isn't caught.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Denylist or junklist?</h2>
          </div>
          <div [class]="ui.well">
            <ul class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface text-[13px] leading-relaxed">
              <li class="px-4 py-2.5">The denylist drops matching mail without telling anyone. It never reaches Junk.</li>
              <li class="px-4 py-2.5">The junklist accepts matching mail and always sorts it into Junk.</li>
            </ul>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SpamSenderLists {
  private readonly api = inject(DnsSpamApi);
  protected readonly ui = UI;

  protected readonly form = injectSpamForm<Lists>({
    load: (id) => this.api.spamSenderLists(id),
    save: (id, value) => this.api.updateSpamSenderLists(id, value),
    saveError: 'Could not save sender lists',
  });
  protected readonly crumbs = spamCrumbs(this.form);
  protected readonly tabs = SPAM_TABS;

  protected readonly fields: { key: keyof Lists; title: string; label: string }[] = [
    { key: 'denylist', title: 'Denylist', label: 'Drop mail from these senders' },
    { key: 'junklist', title: 'Junklist', label: 'Deliver mail from these senders to Junk' },
  ];

  protected set(key: keyof Lists, value: string): void {
    this.form.update({ [key]: value });
  }

  protected readonly counts = computed(() => {
    const lists = this.form.draft();
    return {
      denylist: lists ? listEntries(lists.denylist).length : 0,
      junklist: lists ? listEntries(lists.junklist).length : 0,
    };
  });

  protected readonly total = computed(() => this.counts().denylist + this.counts().junklist);
}
