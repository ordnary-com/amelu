import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { DnsSpamApi, SpamSubjectSettings } from './dns-spam-api';
import { injectSpamForm, spamCrumbs } from './spam-form';

/** Replaces frontend/src/pages/SpamAggressivenessPage.tsx. */
@Component({
  selector: 'amelu-spam-subject',
  imports: [Alert, EmptyState, PageHeader, RouterLink],
  template: `
    <amelu-page-header title="Aggressiveness" [crumbs]="crumbs()">
      Upon receiving, each message gets scored across many different tests and parameters. Once a final score is
      concluded, an action is taken based on it.
    </amelu-page-header>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <form class="min-w-0 space-y-4" (submit)="form.submit($event)">
        @if (form.error(); as message) {
          <amelu-alert kind="error" title="The settings weren't saved" [dismissible]="true" (dismissed)="form.error.set(null)">
            {{ message }}
          </amelu-alert>
        }
        @if (form.success()) {
          <amelu-alert kind="success" title="Settings saved" [dismissible]="true" (dismissed)="form.success.set(false)" />
        }

        <section>
          <h2 [class]="ui.sectionTitle">Subject handling</h2>
          <div [class]="ui.card + ' overflow-hidden'">
            @if (form.draft(); as settings) {
              @for (option of options; track option.key) {
                <div class="flex items-start gap-4 border-b border-line px-4 py-3 last:border-b-0">
                  <span class="min-w-0 flex-1">
                    <span [id]="'spam-' + option.key" class="block text-[14px] font-medium">{{ option.label }}</span>
                    <span class="block text-[12px] text-muted">{{ option.hint }}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    class="relative mt-0.5 h-5 w-9 flex-none cursor-pointer rounded-full transition-colors"
                    [class]="settings[option.key] ? 'bg-accent' : 'bg-line'"
                    [attr.aria-checked]="settings[option.key]"
                    [attr.aria-labelledby]="'spam-' + option.key"
                    (click)="toggle(option.key, !settings[option.key])"
                  >
                    <span
                      class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                      [class.translate-x-4]="settings[option.key]"
                    ></span>
                  </button>
                </div>
              }
            } @else if (form.saved() === null) {
              <amelu-empty-state title="The settings couldn't be loaded" [error]="true" />
            } @else {
              @for (i of [1, 2]; track i) {
                <div class="space-y-2 border-b border-line px-4 py-3 last:border-b-0" aria-hidden="true">
                  <span class="block h-3 w-64 animate-pulse rounded bg-bg"></span>
                  <span class="block h-3 w-40 animate-pulse rounded bg-bg"></span>
                </div>
              }
            }
          </div>
        </section>

        <div class="flex items-center gap-3">
          <button type="submit" [class]="ui.primary" [disabled]="!form.dirty() || form.saving()">
            {{ form.saving() ? 'Saving...' : 'Save changes' }}
          </button>
          <a [routerLink]="'/domains/' + form.id() + '/spam'" class="text-[13px] font-medium text-muted hover:text-ink hover:underline">Cancel</a>
        </div>
      </form>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Why sensitivity isn't here</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Detection sensitivity itself isn't adjustable per domain. It's shared by every domain on our mail servers,
            and changing it would affect other customers. The two controls here apply only to your own domain.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Applies to every mailbox</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Saving updates the filter rules of every mailbox on this domain right away.
          </p>
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
  protected readonly crumbs = spamCrumbs(this.form, 'Aggressiveness');

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

  protected toggle(key: keyof SpamSubjectSettings, on: boolean): void {
    this.form.update({ [key]: on });
  }
}
