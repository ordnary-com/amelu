import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { DnsSpamApi, SpamSenderLists as Lists, listEntries } from './dns-spam-api';
import { injectSpamForm, spamCrumbs } from './spam-form';

/** Replaces frontend/src/pages/SpamSenderListsPage.tsx. */
@Component({
  selector: 'amelu-spam-sender-lists',
  imports: [Alert, EmptyState, PageHeader, RouterLink],
  template: `
    <amelu-page-header title="Sender lists" [crumbs]="crumbs()">
      Any sender address that matches an entry in the denylist is silently dropped. Messages matching listed senders
      will not land in the Junk folder of the recipients.
    </amelu-page-header>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <form class="min-w-0 space-y-4" (submit)="form.submit($event)">
        @if (form.error(); as message) {
          <amelu-alert kind="error" title="The lists weren't saved" [dismissible]="true" (dismissed)="form.error.set(null)">
            {{ message }}
          </amelu-alert>
        }
        @if (form.success()) {
          <amelu-alert kind="success" title="Sender lists saved" [dismissible]="true" (dismissed)="form.success.set(false)" />
        }

        @if (form.draft(); as lists) {
          @for (list of fields; track list.key) {
            <section>
              <h2 [class]="ui.sectionTitle">{{ list.title }}</h2>
              <div [class]="ui.card + ' p-4'">
                <label [for]="'spam-' + list.key" [class]="ui.label">{{ list.label }}</label>
                <textarea
                  [id]="'spam-' + list.key"
                  rows="8"
                  spellcheck="false"
                  autocapitalize="off"
                  class="mt-1.5 w-full rounded-md border border-line bg-transparent px-2.5 py-2 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
                  placeholder="email addresses or wildcard rules, e.g. *@domain.com"
                  [value]="lists[list.key]"
                  (input)="set(list.key, $any($event.target).value)"
                ></textarea>
                <p [class]="ui.hint">
                  One per line. {{ counts()[list.key] }} {{ counts()[list.key] === 1 ? 'entry' : 'entries' }}.
                </p>
              </div>
            </section>
          }
        } @else if (form.saved() === null) {
          <div [class]="ui.card">
            <amelu-empty-state title="The sender lists couldn't be loaded" [error]="true" />
          </div>
        } @else {
          @for (i of [1, 2]; track i) {
            <div [class]="ui.card + ' space-y-3 p-4'" aria-hidden="true">
              <span class="block h-3 w-24 animate-pulse rounded bg-bg"></span>
              <span class="block h-40 w-full animate-pulse rounded bg-bg"></span>
            </div>
          }
        }

        <div class="flex items-center gap-3">
          <button type="submit" [class]="ui.primary" [disabled]="!form.dirty() || form.saving()">
            {{ form.saving() ? 'Saving...' : 'Save changes' }}
          </button>
          <a [routerLink]="'/domains/' + form.id() + '/spam'" class="text-[13px] font-medium text-muted hover:text-ink hover:underline">Cancel</a>
        </div>
      </form>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Wildcards</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            You can use the asterisk wildcard here, e.g.
            <code class="font-mono text-ink">*&#64;domain.com</code>, <code class="font-mono text-ink">spam&#64;*.ru</code>, or even
            <code class="font-mono text-ink">*&#64;*.br</code>. Use with care and try to be as explicit as possible to avoid
            delivery problems.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Denylist or junklist?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            If you instead want to accept matched messages but explicitly sort them as Junk, list them in the junklist.
            The junklist takes precedence over the denylist.
          </p>
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
  protected readonly crumbs = spamCrumbs(this.form, 'Sender lists');

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
}
