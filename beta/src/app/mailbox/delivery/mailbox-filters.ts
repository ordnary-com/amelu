import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxApi, MailboxFilter, MailboxFilterInput } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

const FIELDS: { value: MailboxFilter['field']; label: string }[] = [
  { value: 'from', label: 'the sender' },
  { value: 'to', label: 'the recipient' },
  { value: 'subject', label: 'the subject' },
];
const MATCHES: { value: MailboxFilter['match']; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'is', label: 'is' },
  { value: 'starts', label: 'starts with' },
];
const ACTIONS: { value: MailboxFilter['action']; label: string }[] = [
  { value: 'move', label: 'move it to folder' },
  { value: 'forward', label: 'forward a copy to' },
  { value: 'read', label: 'mark it as read' },
  { value: 'flag', label: 'flag it' },
  { value: 'delete', label: 'delete it' },
];

const blank = (): MailboxFilterInput => ({ field: 'from', match: 'contains', value: '', action: 'move', target: '', stop: true });

/** Mail filters written as sentences, compiled into the mailbox's Sieve script by the API. */
@Component({
  selector: 'amelu-mailbox-filters',
  imports: [Alert, EmptyState, FormsModule, Icon, MailboxHeading, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <amelu-mailbox-heading title="Filters">
      Sort incoming mail as it arrives: move it to a folder, forward a copy, mark it as read, flag it or delete it.
      Filters run top to bottom on the mail servers, so they work in every app.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-4">
        @if (error(); as message) {
          <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">{{ message }}</amelu-alert>
        }

        @if (filters(); as list) {
          @for (f of list; track f.id; let i = $index; let last = $last) {
            @if (editing() === f.id) {
              <ng-container *ngTemplateOutlet="form" />
            } @else {
              <div [class]="ui.card + ' flex items-start gap-3 p-4'">
                <span class="mt-0.5 font-mono text-[12px] text-muted">{{ i + 1 }}</span>
                <p class="min-w-0 flex-1 text-[13px] leading-relaxed">
                  If <span class="font-semibold">{{ fieldLabel(f.field) }}</span> {{ matchLabel(f.match) }}
                  <span class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px]">{{ f.value }}</span>,
                  {{ actionLabel(f.action) }}
                  @if (f.target) {
                    <span class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px]">{{ f.target }}</span>
                  }
                  @if (f.stop && f.action !== 'delete') {
                    <span class="text-muted">and stop there</span>
                  }
                </p>
                <span class="flex flex-none items-center gap-0.5">
                  <button type="button" class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink disabled:opacity-30" aria-label="Move up" [disabled]="i === 0 || busy()" (click)="move(i, -1)">
                    <amelu-icon name="chevronDown" [size]="14" class="rotate-180" />
                  </button>
                  <button type="button" class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink disabled:opacity-30" aria-label="Move down" [disabled]="last || busy()" (click)="move(i, 1)">
                    <amelu-icon name="chevronDown" [size]="14" />
                  </button>
                  <button type="button" class="h-7 cursor-pointer rounded-md px-2 text-[12px] font-medium text-link hover:bg-bg" (click)="edit(f)">Edit</button>
                  <button type="button" class="h-7 cursor-pointer rounded-md px-2 text-[12px] font-medium text-bad hover:bg-bad/10" [disabled]="busy()" (click)="remove(f)">Delete</button>
                </span>
              </div>
            }
          } @empty {
            @if (editing() !== 'new') {
              <div [class]="ui.card">
                <amelu-empty-state title="No filters yet">
                  For example: if the sender contains newsletter, move it to the folder Newsletters.
                  <button actions type="button" [class]="ui.primary" (click)="startNew()">Add a filter</button>
                </amelu-empty-state>
              </div>
            }
          }
          @if (editing() === 'new') {
            <ng-container *ngTemplateOutlet="form" />
          } @else if (list.length) {
            <button type="button" [class]="ui.outline" (click)="startNew()">Add a filter</button>
          }
        } @else {
          <div [class]="ui.card + ' h-24 animate-pulse'"></div>
        }
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">How filters work</h2>
          <ul class="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted">
            <li>Matching ignores upper and lower case.</li>
            <li>A folder that doesn't exist yet is created the first time mail is moved there.</li>
            <li>"Stop there" means the filters below don't run for that message.</li>
            <li>Spam is handled before your filters, and forwarding after them.</li>
          </ul>
        </section>
      </aside>
    </div>

    <ng-template #form>
      <form [class]="ui.card + ' space-y-3 border-accent/50 p-4'" (submit)="save($event)">
        <p class="text-[12px] font-bold tracking-wide text-muted uppercase">{{ editing() === 'new' ? 'New filter' : 'Edit filter' }}</p>
        <div class="flex flex-wrap items-center gap-2 text-[13px]">
          <span>If</span>
          <select class="h-8 rounded-md border border-line bg-transparent px-2" [ngModel]="draft().field" (ngModelChange)="patch({ field: $event })" name="field" aria-label="Field">
            @for (o of fields; track o.value) {<option [value]="o.value">{{ o.label }}</option>}
          </select>
          <select class="h-8 rounded-md border border-line bg-transparent px-2" [ngModel]="draft().match" (ngModelChange)="patch({ match: $event })" name="match" aria-label="Match">
            @for (o of matches; track o.value) {<option [value]="o.value">{{ o.label }}</option>}
          </select>
          <input class="h-8 min-w-40 flex-1 rounded-md border border-line bg-transparent px-2.5 outline-none focus:border-accent" [ngModel]="draft().value" (ngModelChange)="patch({ value: $event })" name="value" placeholder="newsletter" aria-label="Value" autocomplete="off" />
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[13px]">
          <span>then</span>
          <select class="h-8 rounded-md border border-line bg-transparent px-2" [ngModel]="draft().action" (ngModelChange)="patch({ action: $event })" name="action" aria-label="Action">
            @for (o of actions; track o.value) {<option [value]="o.value">{{ o.label }}</option>}
          </select>
          @if (draft().action === 'move' || draft().action === 'forward') {
            <input
              class="h-8 min-w-40 flex-1 rounded-md border border-line bg-transparent px-2.5 outline-none focus:border-accent"
              [ngModel]="draft().target"
              (ngModelChange)="patch({ target: $event })"
              name="target"
              [placeholder]="draft().action === 'move' ? 'Newsletters' : 'name@example.com'"
              [attr.aria-label]="draft().action === 'move' ? 'Folder' : 'Address'"
              autocomplete="off"
            />
          }
        </div>
        @if (draft().action !== 'delete') {
          <label class="flex items-center gap-2 text-[13px]">
            <input type="checkbox" class="size-4 accent-accent" [ngModel]="draft().stop" (ngModelChange)="patch({ stop: $event })" name="stop" />
            Stop there: don't run the filters below for this message
          </label>
        }
        <div class="flex gap-2">
          <button type="submit" [class]="ui.primary" [disabled]="busy() || !draft().value.trim()">{{ busy() ? 'Saving...' : 'Save filter' }}</button>
          <button type="button" [class]="ui.outline" (click)="editing.set(null)">Cancel</button>
        </div>
      </form>
    </ng-template>
  `,
})
export class MailboxFilters {
  private readonly api = inject(MailboxApi);
  private readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;
  protected readonly fields = FIELDS;
  protected readonly matches = MATCHES;
  protected readonly actions = ACTIONS;

  protected readonly filters = perMailbox((id) => this.api.filters(id));
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal<MailboxFilterInput>(blank());
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected fieldLabel = (v: string) => FIELDS.find((f) => f.value === v)?.label ?? v;
  protected matchLabel = (v: string) => MATCHES.find((m) => m.value === v)?.label ?? v;
  protected actionLabel = (v: string) => ACTIONS.find((a) => a.value === v)?.label ?? v;

  protected patch(change: Partial<MailboxFilterInput>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected startNew(): void {
    this.draft.set(blank());
    this.editing.set('new');
  }

  protected edit(f: MailboxFilter): void {
    const { id: _, ...rest } = f;
    this.draft.set(rest);
    this.editing.set(f.id);
  }

  private async reload(): Promise<void> {
    this.filters.set(await firstValueFrom(this.api.filters(this.ctx.id())));
  }

  private async run(work: () => Promise<unknown>, fallback: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await work();
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, fallback));
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const id = this.editing();
    if (!id) return;
    const draft = this.draft();
    await this.run(
      () => firstValueFrom(id === 'new' ? this.api.createFilter(this.ctx.id(), draft) : this.api.updateFilter(this.ctx.id(), id, draft)),
      'The filter could not be saved.',
    );
    if (!this.error()) this.editing.set(null);
  }

  protected remove(f: MailboxFilter): Promise<void> {
    return this.run(() => firstValueFrom(this.api.deleteFilter(this.ctx.id(), f.id)), 'The filter could not be deleted.');
  }

  protected move(index: number, by: number): Promise<void> {
    const ids = (this.filters() ?? []).map((f) => f.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    return this.run(() => firstValueFrom(this.api.reorderFilters(this.ctx.id(), ids)), 'The order could not be saved.');
  }
}
