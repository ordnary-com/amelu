import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxAttachedNotesPage: free text kept with the mailbox. */
@Component({
  selector: 'amelu-mailbox-notes',
  imports: [RouterLink, EmptyState, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Attached notes">
      If you have some information you want attached to the mailbox, use the notes field. These are shown on the
      mailbox's overview.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The notes couldn't be loaded" [error]="true" />
      } @else {
        <form [class]="ui.card + ' space-y-4 p-4'" (submit)="submit($event)">
          <label class="block">
            <span [class]="ui.label">Notes</span>
            <textarea
              rows="8"
              [class]="ui.input + ' h-auto py-2'"
              placeholder="Anything you want to add..."
              [disabled]="!loaded()"
              [value]="notes()"
              (input)="notes.set($any($event.target).value); save.reset()"
            ></textarea>
          </label>
          <amelu-save-feedback [state]="save" />
          <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
            {{ save.busy() ? 'Saving...' : 'Save changes' }}
          </button>
        </form>
      }

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Ideas</h2>
          <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              Who uses this mailbox, and who to ask before changing it.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              Why it's set up the way it is, like a forward or a limit.
            </li>
          </ul>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Who sees them</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Only people in your organization, here in the dashboard. Notes are never added to mail.
          </p>
          <a [routerLink]="ctx.base()" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">Overview</a>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxNotes {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly loaded = perMailbox((id) => this.api.notes(id));
  protected readonly notes = linkedSignal(() => this.loaded()?.notes ?? '');
  protected readonly changed = computed(() => {
    const loaded = this.loaded();
    return !!loaded && loaded.notes !== this.notes();
  });
  protected readonly save = new Saving();

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateNotes(this.ctx.id(), this.notes()), 'Could not save notes');
    if (result) this.loaded.set(result);
  }
}
