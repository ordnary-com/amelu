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
      Sort incoming mail on the mail servers, so your filters work in every app.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        @if (error(); as message) {
          <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">{{ message }}</amelu-alert>
        }

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">
              Filters
              @if (filters(); as list) {
                <span class="font-normal text-muted">({{ list.length }})</span>
              }
            </h2>
            @if (filters()) {
              <button
                type="button"
                [class]="ui.setAction + ' cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent'"
                aria-label="Add a filter"
                title="Add a filter"
                [disabled]="editing() === 'new'"
                (click)="startNew()"
              >
                <amelu-icon name="plus" [size]="18" />
              </button>
            }
          </div>
          <div [class]="ui.well">
            @if (filters() === null) {
              <amelu-empty-state class="rounded-md border border-line bg-surface" title="Filters couldn't be loaded" [error]="true" [compact]="true" />
            } @else {
              <div [class]="ui.tableWrap">
                <table [class]="ui.table">
                  <thead>
                    <tr>
                      <th [class]="ui.th + ' w-0'">#</th>
                      <th [class]="ui.th">Rule</th>
                      <th class="w-0 pr-4" aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @if (filters(); as list) {
                      @for (f of list; track f.id; let i = $index; let last = $last) {
                        @if (editing() === f.id) {
                          <tr [class]="ui.tr">
                            <td colspan="3" class="p-0">
                              <ng-container *ngTemplateOutlet="form" />
                            </td>
                          </tr>
                        } @else {
                          <tr [class]="ui.tr + ' hover:bg-bg/40'">
                            <td [class]="ui.td + ' w-0 font-mono text-[12px] text-muted tabular-nums'">{{ i + 1 }}</td>
                            <td [class]="ui.td + ' leading-relaxed'">
                              <ng-container *ngTemplateOutlet="sentence; context: { $implicit: f }" />
                            </td>
                            <td class="w-0 pr-4 whitespace-nowrap">
                              <span class="flex items-center justify-end gap-0.5">
                                <button type="button" [class]="iconButton" aria-label="Move up" [disabled]="i === 0 || busy()" (click)="move(i, -1)">
                                  <amelu-icon name="chevronDown" [size]="14" class="rotate-180" />
                                </button>
                                <button type="button" [class]="iconButton" aria-label="Move down" [disabled]="last || busy()" (click)="move(i, 1)">
                                  <amelu-icon name="chevronDown" [size]="14" />
                                </button>
                                <!-- Off while another filter is open, so its unsaved changes aren't swapped out. -->
                                <button type="button" class="ml-2 cursor-pointer text-[13px] text-link hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-50" [disabled]="busy() || editing() !== null" (click)="edit(f)">Edit</button>
                                <button type="button" class="ml-3 cursor-pointer text-[13px] text-bad hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-50" [disabled]="busy()" (click)="remove(f)">Delete</button>
                              </span>
                            </td>
                          </tr>
                        }
                      } @empty {
                        <tr [class]="ui.tr">
                          <td colspan="3" class="px-4 py-10 text-center">
                            <amelu-icon name="inbox" [size]="18" class="mx-auto block" />
                            <p class="mt-2">No filters yet</p>
                            <p class="mt-0.5 text-[13px] text-muted">For example: if the sender contains newsletter, move it to the folder Newsletters.</p>
                            @if (editing() !== 'new') {
                              <button type="button" class="mt-1 cursor-pointer text-[13px] text-link hover:underline" (click)="startNew()">Add a filter</button>
                            }
                          </td>
                        </tr>
                      }
                    } @else {
                      @for (i of [1, 2]; track i) {
                        <tr [class]="ui.tr" aria-hidden="true">
                          <td [class]="ui.td"><span class="block h-3 w-3 animate-pulse rounded bg-bg"></span></td>
                          <td [class]="ui.td"><span class="block h-3 w-72 max-w-full animate-pulse rounded bg-bg"></span></td>
                          <td></td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </section>

        @if (editing() === 'new') {
          <section [class]="ui.panel">
            <div [class]="ui.panelHeader">
              <h2 [class]="ui.panelTitle">New filter</h2>
            </div>
            <ng-container *ngTemplateOutlet="form" />
          </section>
        }
      </div>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">How filters work</h2>
          </div>
          <div [class]="ui.well">
            <ul class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface text-[13px] leading-relaxed">
              <li class="px-4 py-2.5">Filters run from top to bottom. Use the arrows to change the order.</li>
              <li class="px-4 py-2.5">Matching ignores upper and lower case.</li>
              <li class="px-4 py-2.5">A folder that doesn't exist yet is created the first time mail is moved there.</li>
              <li class="px-4 py-2.5">"Stop there" means the filters below don't run for that message.</li>
              <li class="px-4 py-2.5">Spam is handled before your filters, and forwarding after them.</li>
            </ul>
          </div>
        </section>
      </aside>
    </div>

    <!-- A filter as one sentence, for the list and the live preview in the form. -->
    <ng-template #sentence let-f>
      If <span class="font-medium">{{ fieldLabel(f.field) }}</span> {{ matchLabel(f.match) }}
      <code class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px]">{{ f.value || '...' }}</code>,
      {{ actionLabel(f.action) }}
      @if (f.action === 'move' || f.action === 'forward') {
        <code class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px]">{{ f.target || '...' }}</code>
      }
      @if (f.stop && f.action !== 'delete') {
        <span class="text-muted">and stop there</span>
      }
    </ng-template>

    <ng-template #form>
      <form (submit)="save($event)">
        <div class="space-y-4 p-4">
          @if (editing() !== 'new') {
            <p class="text-[15px] font-medium">Edit filter</p>
          }
          <div>
            <p class="text-[13px] font-medium">When a message arrives</p>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              <span class="w-9 text-muted">If</span>
              <span class="relative inline-flex">
                <select [class]="select" [ngModel]="draft().field" (ngModelChange)="patch({ field: $event })" name="field" aria-label="Field">
                  @for (o of fields; track o.value) {<option [value]="o.value">{{ o.label }}</option>}
                </select>
                <amelu-icon name="chevronDown" [size]="14" class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
              </span>
              <span class="relative inline-flex">
                <select [class]="select" [ngModel]="draft().match" (ngModelChange)="patch({ match: $event })" name="match" aria-label="Match">
                  @for (o of matches; track o.value) {<option [value]="o.value">{{ o.label }}</option>}
                </select>
                <amelu-icon name="chevronDown" [size]="14" class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
              </span>
              <input [class]="text" [ngModel]="draft().value" (ngModelChange)="patch({ value: $event })" name="value" placeholder="newsletter" aria-label="Value" autocomplete="off" />
            </div>
          </div>
          <div>
            <p class="text-[13px] font-medium">Do this</p>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              <span class="w-9 text-muted">then</span>
              <span class="relative inline-flex">
                <select [class]="select" [ngModel]="draft().action" (ngModelChange)="patch({ action: $event })" name="action" aria-label="Action">
                  @for (o of actions; track o.value) {<option [value]="o.value">{{ o.label }}</option>}
                </select>
                <amelu-icon name="chevronDown" [size]="14" class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
              </span>
              @if (draft().action === 'move' || draft().action === 'forward') {
                <input
                  [class]="text"
                  [ngModel]="draft().target"
                  (ngModelChange)="patch({ target: $event })"
                  name="target"
                  [placeholder]="draft().action === 'move' ? 'Newsletters' : 'name@example.com'"
                  [attr.aria-label]="draft().action === 'move' ? 'Folder' : 'Address'"
                  autocomplete="off"
                />
              }
            </div>
          </div>
          @if (draft().action !== 'delete') {
            <label class="flex cursor-pointer items-center gap-4 rounded-md border border-line bg-surface px-4 py-3">
              <span class="min-w-0 flex-1">
                <span class="block text-[14px]">Stop there</span>
                <span class="mt-0.5 block text-[13px] text-muted">Don't run the filters below for this message.</span>
              </span>
              <button
                type="button"
                role="switch"
                class="relative inline-flex h-6 w-10 flex-none cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                [class]="draft().stop ? 'bg-accent' : 'bg-line'"
                [attr.aria-checked]="draft().stop"
                aria-label="Stop there"
                (click)="patch({ stop: !draft().stop })"
              >
                <span class="size-5 rounded-full bg-white shadow-sm transition-transform" [class]="draft().stop ? 'translate-x-[18px]' : 'translate-x-0.5'"></span>
              </button>
            </label>
          }
          <!-- The rule as it would be saved now. -->
          <p class="flex gap-2.5 rounded-md border border-line bg-well px-4 py-3 text-[13px] leading-relaxed">
            <amelu-icon name="listChecks" [size]="15" class="mt-0.5 flex-none text-muted" />
            <span><ng-container *ngTemplateOutlet="sentence; context: { $implicit: draft() }" /></span>
          </p>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-line bg-well px-4 py-3">
          <button type="button" [class]="ui.outline + ' h-9 bg-surface'" (click)="editing.set(null)">Cancel</button>
          <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="busy() || !draft().value.trim()">{{ busy() ? 'Saving...' : 'Save filter' }}</button>
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
  // Rule editor controls and the reorder arrows.
  protected readonly select =
    'h-9 cursor-pointer appearance-none rounded-md border border-line bg-surface pr-8 pl-3 outline-none hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/25 [&>option]:bg-surface';
  protected readonly text =
    'h-9 min-w-40 flex-1 rounded-md border border-line bg-surface px-3 outline-none placeholder:text-muted/70 hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/25';
  protected readonly iconButton =
    'inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent';

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
