import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxAttachedNotesPage: free text kept with the mailbox. */
@Component({
  selector: 'amelu-mailbox-notes',
  imports: [RouterLink, EmptyState, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Attached notes">
      Free-form notes about this mailbox, shown on its overview.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <form class="min-w-0 space-y-5" (submit)="submit($event)">
        <amelu-save-feedback [state]="save" success="Notes saved." />

        @if (loaded() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The notes couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Notes</h2>
              @if (loaded()) {
                <span class="text-[13px] text-muted tabular-nums">{{ notes().length }} {{ notes().length === 1 ? 'character' : 'characters' }}</span>
              }
            </div>
            <div class="px-5 py-4">
              <label for="mailbox-notes" class="block text-[14px]">Notes for {{ ctx.mailbox()?.address ?? 'this mailbox' }}</label>
              @if (loaded()) {
                <textarea
                  id="mailbox-notes"
                  rows="10"
                  class="mt-2 block w-full resize-y rounded-md border border-line bg-surface px-3.5 py-2.5 text-[14px] leading-relaxed outline-none placeholder:text-muted/70 hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/25"
                  placeholder="For example: who uses this mailbox, or why a setting is the way it is"
                  [value]="notes()"
                  (input)="notes.set($any($event.target).value); save.reset()"
                ></textarea>
              } @else {
                <span class="mt-2 block h-[232px] w-full animate-pulse rounded-md bg-bg" aria-hidden="true"></span>
              }
            </div>
            <p [class]="ui.setNote">
              <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
              <span>Plain text, shown on the mailbox's overview. Leave it empty to remove the notes.</span>
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
            <h2 [class]="ui.panelTitle">Ideas</h2>
          </div>
          <div [class]="ui.well">
            <ul class="space-y-2 text-[13px] leading-relaxed text-muted">
              <li class="flex gap-2.5">
                <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
                Who uses this mailbox, and who to ask before changing it.
              </li>
              <li class="flex gap-2.5">
                <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
                Why it's set up the way it is, like a forward or a limit.
              </li>
            </ul>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Who sees them</h2>
            <a [routerLink]="ctx.base()" class="text-[13px] text-link hover:underline">Overview</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Only people in your organization, here in the dashboard and on the mailbox's overview. Notes are never
              added to mail.
            </p>
          </div>
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
