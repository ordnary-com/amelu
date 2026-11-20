import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxListingSettingsPage: name and tags for the mailbox list. */
@Component({
  selector: 'amelu-mailbox-listing-settings',
  imports: [RouterLink, EmptyState, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Listing settings">
      How this mailbox shows up in the mailbox list, with a name and tags to group it with similar ones.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <form class="min-w-0 space-y-5" (submit)="submit($event)">
        <amelu-save-feedback [state]="save" success="Listing settings saved." />

        @if (loaded() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The listing settings couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">In the mailbox list</h2>
            </div>
            <div class="space-y-5 px-5 py-4">
              <div>
                <label for="listing-name" class="block text-[14px]">Name</label>
                @if (loaded()) {
                  <input
                    id="listing-name"
                    [class]="bigInput"
                    placeholder="Jane Doe"
                    autocomplete="off"
                    [value]="name()"
                    (input)="name.set($any($event.target).value); save.reset()"
                  />
                } @else {
                  <span class="mt-2 block h-11 animate-pulse rounded-md bg-bg" aria-hidden="true"></span>
                }
                <p class="mt-1.5 text-[12px] text-muted">The same name as on the overview.</p>
              </div>
              <div>
                <label for="listing-tags" class="block text-[14px]">Tags</label>
                @if (loaded()) {
                  <input
                    id="listing-tags"
                    [class]="bigInput"
                    placeholder="sales, support"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    [value]="tags()"
                    (input)="tags.set($any($event.target).value); save.reset()"
                  />
                } @else {
                  <span class="mt-2 block h-11 animate-pulse rounded-md bg-bg" aria-hidden="true"></span>
                }
                <p class="mt-1.5 text-[12px] text-muted">Separate tags with commas. Mailboxes with the same tag are grouped in the list.</p>
                @if (tagList().length) {
                  <div class="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Tags">
                    @for (tag of tagList(); track tag) {
                      <span class="rounded-full border border-line bg-well px-2.5 py-0.5 text-[12px] font-medium">{{ tag }}</span>
                    }
                  </div>
                }
              </div>
            </div>
            <p [class]="ui.setNote">
              <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
              <span>Tags are only used here in the dashboard, to group and find mailboxes.</span>
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
            <h2 [class]="ui.panelTitle">Tags</h2>
            <a [routerLink]="'/domains/' + ctx.domainId() + '/mailboxes'" class="text-[13px] text-link hover:underline">Mailboxes</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Use the same tag on related mailboxes, like everyone in sales, to find them together in the mailbox list.
            </p>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxListingSettings {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;
  protected readonly bigInput =
    'mt-2 h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[15px] outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25';

  protected readonly loaded = perMailbox((id) => this.api.listing(id));
  protected readonly name = linkedSignal(() => this.loaded()?.name ?? '');
  protected readonly tags = linkedSignal(() => this.loaded()?.tags ?? '');
  protected readonly tagList = computed(() =>
    this.tags()
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
  protected readonly changed = computed(() => {
    const loaded = this.loaded();
    return !!loaded && (loaded.name !== this.name() || loaded.tags !== this.tags());
  });
  protected readonly save = new Saving();

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateListing(this.ctx.id(), { name: this.name(), tags: this.tags() }), 'Could not save listing settings');
    if (result) {
      this.loaded.set(result);
      // The listing name is the mailbox's display name, which the header shows.
      this.ctx.update((mailbox) => ({ ...mailbox, displayName: result.name }));
    }
  }
}
