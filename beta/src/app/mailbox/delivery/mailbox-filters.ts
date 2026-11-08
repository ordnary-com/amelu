import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';
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
  imports: [Alert, DitherShader, EmptyState, FormsModule, Icon, MailboxHeading, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <amelu-mailbox-heading title="Filters">
      Sort incoming mail as it arrives: move it to a folder, forward a copy, mark it as read, flag it or delete it.
      Filters run top to bottom on the mail servers, so they work in every app.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        @if (error(); as message) {
          <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">{{ message }}</amelu-alert>
        }

        @if (filters(); as list) {
          @if (list.length || editing() !== 'new') {
            <section>
              <h2 [class]="ui.sectionTitle + ' flex items-center gap-2'">
                Your filters
                <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ list.length }}</span>
              </h2>
              <div [class]="ui.card + ' overflow-hidden'">
                <ul class="divide-y divide-line">
                  @for (f of list; track f.id; let i = $index; let last = $last) {
                    @if (editing() === f.id) {
                      <li class="p-4">
                        <ng-container *ngTemplateOutlet="form" />
                      </li>
                    } @else {
                      <li class="flex items-center gap-3 px-4 py-3 hover:bg-bg/60">
                        <span class="inline-flex size-8 flex-none items-center justify-center rounded-full bg-bg font-mono text-[12px] text-muted">
                          {{ i + 1 }}
                        </span>
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
                          <button type="button" class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink disabled:cursor-default disabled:opacity-30" aria-label="Move up" [disabled]="i === 0 || busy()" (click)="move(i, -1)">
                            <amelu-icon name="chevronDown" [size]="14" class="rotate-180" />
                          </button>
                          <button type="button" class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink disabled:cursor-default disabled:opacity-30" aria-label="Move down" [disabled]="last || busy()" (click)="move(i, 1)">
                            <amelu-icon name="chevronDown" [size]="14" />
                          </button>
                          <!-- Off while another filter is open, so its unsaved changes aren't swapped out. -->
                          <button type="button" class="h-7 cursor-pointer rounded-md px-2 text-[12px] font-medium text-link hover:bg-bg disabled:cursor-default disabled:opacity-50" [disabled]="busy() || editing() !== null" (click)="edit(f)">Edit</button>
                          <button type="button" class="h-7 cursor-pointer rounded-md px-2 text-[12px] font-medium text-bad hover:bg-bad/10 disabled:cursor-default disabled:opacity-50" [disabled]="busy()" (click)="remove(f)">Delete</button>
                        </span>
                      </li>
                    }
                  } @empty {
                    <li>
                      <amelu-empty-state title="No filters yet">
                        For example: if the sender contains newsletter, move it to the folder Newsletters.
                        <button actions type="button" [class]="ui.primary" (click)="startNew()">Add a filter</button>
                      </amelu-empty-state>
                    </li>
                  }
                </ul>
              </div>
            </section>
          }
          @if (editing() === 'new') {
            <section>
              <h2 [class]="ui.sectionTitle">New filter</h2>
              <div [class]="ui.card + ' p-4'">
                <ng-container *ngTemplateOutlet="form" />
              </div>
            </section>
          } @else if (list.length) {
            <button type="button" [class]="ui.outline" (click)="startNew()">Add a filter</button>
          }
        } @else {
          <section aria-hidden="true">
            <span class="mb-3 block h-4 w-24 animate-pulse rounded bg-bg"></span>
            <ul [class]="ui.card + ' divide-y divide-line'">
              @for (i of [1, 2]; track i) {
                <li class="flex items-center gap-3 px-4 py-3">
                  <span class="size-8 flex-none animate-pulse rounded-full bg-bg"></span>
                  <span class="block h-3 w-72 max-w-full animate-pulse rounded bg-bg"></span>
                </li>
              }
            </ul>
          </section>
        }
      </div>

      <aside class="space-y-6">
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="inbox" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">How filters work</h2>
          <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
            <li class="flex gap-2.5"><span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>Matching ignores upper and lower case.</li>
            <li class="flex gap-2.5"><span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>A folder that doesn't exist yet is created the first time mail is moved there.</li>
            <li class="flex gap-2.5"><span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>"Stop there" means the filters below don't run for that message.</li>
            <li class="flex gap-2.5"><span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>Spam is handled before your filters, and forwarding after them.</li>
          </ul>
        </section>
      </aside>
    </div>

    <ng-template #form>
      <form class="space-y-4" (submit)="save($event)">
        @if (editing() !== 'new') {
          <p class="text-[14px] font-bold">Edit filter</p>
        }
        <div class="flex flex-wrap items-center gap-2 text-[13px]">
          <span>If</span>
          <span class="relative inline-flex">
            <select class="h-8 cursor-pointer appearance-none rounded-md border border-line bg-surface pr-7 pl-2.5 outline-none hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/30 [&>option]:bg-surface" [ngModel]="draft().field" (ngModelChange)="patch({ field: $event })" name="field" aria-label="Field">
              @for (o of fields; track o.value) {<option [value]="o.value">{{ o.label }}</option>}
            </select>
            <amelu-icon name="chevronDown" [size]="14" class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted" />
          </span>
          <span class="relative inline-flex">
            <select class="h-8 cursor-pointer appearance-none rounded-md border border-line bg-surface pr-7 pl-2.5 outline-none hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/30 [&>option]:bg-surface" [ngModel]="draft().match" (ngModelChange)="patch({ match: $event })" name="match" aria-label="Match">
              @for (o of matches; track o.value) {<option [value]="o.value">{{ o.label }}</option>}
            </select>
            <amelu-icon name="chevronDown" [size]="14" class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted" />
          </span>
          <input class="h-8 min-w-40 flex-1 rounded-md border border-line bg-transparent px-2.5 outline-none placeholder:text-muted hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/30" [ngModel]="draft().value" (ngModelChange)="patch({ value: $event })" name="value" placeholder="For example: newsletter" aria-label="Value" autocomplete="off" />
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[13px]">
          <span>then</span>
          <span class="relative inline-flex">
            <select class="h-8 cursor-pointer appearance-none rounded-md border border-line bg-surface pr-7 pl-2.5 outline-none hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/30 [&>option]:bg-surface" [ngModel]="draft().action" (ngModelChange)="patch({ action: $event })" name="action" aria-label="Action">
              @for (o of actions; track o.value) {<option [value]="o.value">{{ o.label }}</option>}
            </select>
            <amelu-icon name="chevronDown" [size]="14" class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted" />
          </span>
          @if (draft().action === 'move' || draft().action === 'forward') {
            <input
              class="h-8 min-w-40 flex-1 rounded-md border border-line bg-transparent px-2.5 outline-none placeholder:text-muted hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/30"
              [ngModel]="draft().target"
              (ngModelChange)="patch({ target: $event })"
              name="target"
              [placeholder]="draft().action === 'move' ? 'For example: Newsletters' : 'For example: name@example.com'"
              [attr.aria-label]="draft().action === 'move' ? 'Folder' : 'Address'"
              autocomplete="off"
            />
          }
        </div>
        @if (draft().action !== 'delete') {
          <label class="flex cursor-pointer items-center gap-3 text-[13px]">
            <button
              type="button"
              role="switch"
              class="relative inline-flex h-6 w-10 flex-none cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
              [class]="draft().stop ? 'bg-accent' : 'bg-line'"
              [attr.aria-checked]="draft().stop"
              (click)="patch({ stop: !draft().stop })"
            >
              <span class="size-5 rounded-full bg-white shadow-sm transition-transform" [class]="draft().stop ? 'translate-x-[18px]' : 'translate-x-0.5'"></span>
            </button>
            <span>Stop there: don't run the filters below for this message</span>
          </label>
        }
        <div class="-mx-4 -mb-4 flex justify-end gap-2 border-t border-line bg-bg/40 px-4 py-3">
          <button type="button" [class]="ui.outline" (click)="editing.set(null)">Cancel</button>
          <button type="submit" [class]="ui.primary" [disabled]="busy() || !draft().value.trim()">{{ busy() ? 'Saving...' : 'Save filter' }}</button>
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
