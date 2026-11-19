import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { DnsSpamApi, SpamSubjectSettings } from './dns-spam-api';
import { injectSpamForm, spamCrumbs } from './spam-form';
import { SPAM_TABS, SectionTabs } from '../section-tabs';

/** Replaces frontend/src/pages/SpamAggressivenessPage.tsx. */
@Component({
  selector: 'amelu-spam-subject',
  imports: [SectionTabs, Alert, EmptyState, Icon, PageHeader, RouterLink],
  template: `
    <amelu-page-header title="Spam filtering" [crumbs]="crumbs()">
      Two extra rules for marking and catching junk, on top of the spam score every message gets.
    </amelu-page-header>

    <amelu-section-tabs label="Spam filtering" [base]="'/domains/' + form.id()" [tabs]="tabs" />

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <form class="min-w-0 space-y-5" (submit)="form.submit($event)">
        @if (form.error(); as message) {
          <amelu-alert kind="error" title="The settings weren't saved" [dismissible]="true" (dismissed)="form.error.set(null)">
            {{ message }}
          </amelu-alert>
        }
        @if (form.success()) {
          <amelu-alert kind="success" title="Settings saved" [dismissible]="true" (dismissed)="form.success.set(false)" />
        }

        @if (form.saved() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The settings couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Subject handling</h2>
              @if (form.draft()) {
                <span class="text-[13px] text-muted tabular-nums">{{ enabledCount() }} of {{ options.length }} on</span>
              }
            </div>
            <ul class="divide-y divide-line">
              @for (option of options; track option.key) {
                <li class="flex items-center gap-4 px-5 py-3.5">
                  <span class="min-w-0 flex-1">
                    <span [id]="'spam-' + option.key" class="block text-[14px]">{{ option.label }}</span>
                    <span class="mt-0.5 block text-[13px] text-muted">{{ option.hint }}</span>
                  </span>
                  @if (form.draft(); as settings) {
                    <button
                      type="button"
                      role="switch"
                      class="relative inline-flex h-6 w-10 flex-none cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                      [class]="settings[option.key] ? 'bg-accent' : 'bg-line'"
                      [attr.aria-checked]="settings[option.key]"
                      [attr.aria-labelledby]="'spam-' + option.key"
                      (click)="toggle(option.key, !settings[option.key])"
                    >
                      <span
                        class="size-5 rounded-full bg-white shadow-sm transition-transform"
                        [class]="settings[option.key] ? 'translate-x-[18px]' : 'translate-x-0.5'"
                      ></span>
                    </button>
                  } @else {
                    <span class="h-6 w-10 flex-none animate-pulse rounded-full bg-bg" aria-hidden="true"></span>
                  }
                </li>
              }
            </ul>
            <p [class]="ui.setNote">
              <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
              <span>Saving updates the filter rules of every mailbox on this domain right away.</span>
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
            <h2 [class]="ui.panelTitle">Why sensitivity isn't here</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Detection sensitivity isn't adjustable per domain. It's shared by every domain on our mail servers, so
              changing it would affect other customers. The two rules here apply only to your own domain.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Block senders instead</h2>
            <a [routerLink]="'/domains/' + form.id() + '/spam/sender-lists'" class="text-[13px] text-link hover:underline">Sender lists</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Getting a lot of junk from the same senders? Drop their mail or send it straight to Junk with the sender lists.
            </p>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SpamSubject {
  private readonly api = inject(DnsSpamApi);
  protected readonly ui = UI;

  protected readonly form = injectSpamForm<SpamSubjectSettings>({
    load: (id) => this.api.spamSubjectSettings(id),
    save: (id, value) => this.api.updateSpamSubjectSettings(id, value),
    saveError: 'Could not save settings',
  });
  protected readonly crumbs = spamCrumbs(this.form);
  protected readonly tabs = SPAM_TABS;

  protected readonly options: { key: keyof SpamSubjectSettings; label: string; hint: string }[] = [
    {
      key: 'subjectRewrite',
      label: 'Prefix subject line of junk messages with "SPAM"',
      hint: 'Makes junk easy to spot in mail apps that show every folder.',
    },
    {
      key: 'junkIfSubjectSpam',
      label: 'Junk messages with word "SPAM" in subject (case insensitive)',
      hint: 'Catches mail that another filter already tagged as spam.',
    },
  ];

  protected readonly enabledCount = computed(() => {
    const settings = this.form.draft();
    return settings ? this.options.filter((option) => settings[option.key]).length : 0;
  });

  protected toggle(key: keyof SpamSubjectSettings, on: boolean): void {
    this.form.update({ [key]: on });
  }
}
