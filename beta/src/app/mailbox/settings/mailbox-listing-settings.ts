import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxListingSettingsPage: name and tags for the mailbox list. */
@Component({
  selector: 'amelu-mailbox-listing-settings',
  imports: [RouterLink, EmptyState, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Listing settings">
      Enhance the mailboxes listing with short descriptions. Logically similar mailboxes may be grouped together by
      using the same tags, for example hr, sales etc.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The listing settings couldn't be loaded" [error]="true" />
      } @else {
        <form [class]="ui.card + ' space-y-4 p-4'" (submit)="submit($event)">
          <label class="block">
            <span [class]="ui.label">Name</span>
            <input
              [class]="ui.input"
              placeholder="eg. Jane Doe"
              [disabled]="!loaded()"
              [value]="name()"
              (input)="name.set($any($event.target).value); save.reset()"
            />
            <span [class]="ui.hint">The same name as on the overview.</span>
          </label>
          <label class="block">
            <span [class]="ui.label">Comma-separated tags</span>
            <input
              [class]="ui.input"
              placeholder="eg. group1, group2..."
              [disabled]="!loaded()"
              [value]="tags()"
              (input)="tags.set($any($event.target).value); save.reset()"
            />
            <span [class]="ui.hint">
              Comma separated tags will automatically group your mailboxes in the listing and provide you with shortcuts
              for them.
            </span>
          </label>
          @if (tagList().length) {
            <div class="flex flex-wrap gap-1.5">
              @for (tag of tagList(); track tag) {
                <span class="rounded bg-bg px-2 py-0.5 text-[12px]">{{ tag }}</span>
              }
            </div>
          }
          <amelu-save-feedback [state]="save" />
          <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
            {{ save.busy() ? 'Saving...' : 'Save changes' }}
          </button>
        </form>
      }

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Tags</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Use the same tag on related mailboxes, like everyone in sales, to find them together in the mailbox list.
          </p>
          <a [routerLink]="'/domains/' + ctx.domainId() + '/mailboxes'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Mailboxes
          </a>
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
