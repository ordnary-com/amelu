import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ActivityEntry } from '../../api';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { Icon, IconName } from '../../icon';

type Category = 'all' | 'mailbox' | 'access' | 'delivery';

// Which filter an event belongs to, by what follows "mailbox."; anything else is about the mailbox itself.
const CATEGORY_BY_ACTION: [RegExp, Exclude<Category, 'all'>][] = [
  [/^(password|services|internal_access|webmail)/, 'access'],
  [/^(forward|identity|filter|delegation|message_sent)/, 'delivery'],
];

const DOT: Record<Exclude<Category, 'all'>, string> = {
  mailbox: 'bg-ok',
  access: 'bg-ink/60',
  delivery: 'bg-accent',
};

const ICON: Record<Exclude<Category, 'all'>, IconName> = {
  mailbox: 'inbox',
  access: 'key',
  delivery: 'mail',
};

const TILE: Record<Exclude<Category, 'all'>, string> = {
  mailbox: 'bg-ok/15 text-ok',
  access: 'bg-ink/8 text-ink',
  delivery: 'bg-accent/12 text-link',
};

interface Row {
  entry: ActivityEntry;
  category: Exclude<Category, 'all'>;
  tile: string;
  bySupport: boolean;
}

/** The current dashboard's MailboxRecentActivityPage, grouped by day. */
@Component({
  selector: 'amelu-mailbox-activity',
  imports: [DatePipe, RouterLink, EmptyState, MailboxHeading, Icon],
  template: `
    <amelu-mailbox-heading title="Recent activity">The last 50 events recorded for this mailbox, newest first.</amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <section [class]="ui.panel">
        <div [class]="ui.panelHeader">
          <h2 [class]="ui.panelTitle">Events</h2>
          @if (entries(); as list) {
            <span class="text-[13px] text-muted">{{ list.length }} {{ list.length === 1 ? 'event' : 'events' }}</span>
          }
        </div>
        <div [class]="ui.well">
          <!-- Filter by what an event touched, with counts. -->
          <div class="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter activity">
            @for (option of chips(); track option.value) {
              <button
                type="button"
                class="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-[13px] font-medium transition-colors"
                [class]="filter() === option.value ? choiceOn : 'border-line bg-surface text-muted hover:border-ink/20 hover:text-ink'"
                [attr.aria-pressed]="filter() === option.value"
                (click)="filter.set(option.value)"
              >
                @if (option.value !== 'all') {
                  <span class="size-2 rounded-full" [class]="dot[option.value]" aria-hidden="true"></span>
                }
                {{ option.label }}
                @if (option.count !== null) {
                  <span class="text-[12px] font-normal text-muted tabular-nums">{{ option.count }}</span>
                }
              </button>
            }
          </div>

          @if (entries() === null) {
            <amelu-empty-state class="rounded-md border border-line bg-surface" title="Activity couldn't be loaded" [error]="true" [compact]="true" />
          } @else {
            <div [class]="ui.tableWrap">
              <table [class]="ui.table">
                <thead>
                  <tr>
                    <th [class]="ui.th">Event</th>
                    <th [class]="ui.th + ' max-md:hidden'">Type</th>
                    <th [class]="ui.th + ' w-0 text-right'">Time</th>
                  </tr>
                </thead>
                <tbody>
                  @if (days(); as groups) {
                    @for (group of groups; track group.day) {
                      <!-- One group row per day, like the domain's activity. -->
                      <tr [class]="ui.tr">
                        <td colspan="3" [class]="groupRow">
                          {{ dayLabel(group.day) }} <span class="font-normal">· {{ group.rows.length }}</span>
                        </td>
                      </tr>
                      @for (row of group.rows; track row.entry.id) {
                        <tr [class]="ui.tr">
                          <td [class]="ui.td">
                            <span class="flex items-start gap-3">
                              <span class="mt-px inline-flex size-7 flex-none items-center justify-center rounded-full" [class]="row.tile" aria-hidden="true">
                                <amelu-icon [name]="icon[row.category]" [size]="14" />
                              </span>
                              <span class="min-w-0 pt-1">
                                <span class="block break-words">{{ row.entry.message }}</span>
                                @if (row.bySupport) {
                                  <span [class]="ui.tdSub"><amelu-icon name="lifebuoy" [size]="12" />By Amelu support</span>
                                }
                              </span>
                            </span>
                          </td>
                          <td [class]="ui.td + ' whitespace-nowrap max-md:hidden'">
                            <span class="inline-flex items-center gap-2">
                              <span class="size-2 rounded-full" [class]="dot[row.category]" aria-hidden="true"></span>
                              {{ label[row.category] }}
                            </span>
                          </td>
                          <td [class]="ui.td + ' text-right whitespace-nowrap text-muted tabular-nums'">
                            <time [attr.datetime]="row.entry.createdAt" [title]="row.entry.createdAt | date: 'd MMM y, HH:mm:ss'">{{ row.entry.createdAt | date: 'HH:mm' }}</time>
                          </td>
                        </tr>
                      }
                    } @empty {
                      <tr [class]="ui.tr">
                        <td colspan="3" class="px-4 py-10 text-center">
                          <amelu-icon [name]="filter() === 'all' ? 'clock' : 'search'" [size]="18" class="mx-auto block" />
                          @if (filter() === 'all') {
                            <p class="mt-2">No activity recorded yet</p>
                            <p class="mt-0.5 text-[13px] text-muted">Changes to this mailbox, like a new password or forward, show up here.</p>
                          } @else {
                            <p class="mt-2">Nothing in this category</p>
                            <button type="button" class="mt-1 cursor-pointer text-[13px] text-link hover:underline" (click)="filter.set('all')">Show all events</button>
                          }
                        </td>
                      </tr>
                    }
                  } @else {
                    @for (i of [1, 2, 3, 4]; track i) {
                      <tr [class]="ui.tr" aria-hidden="true">
                        <td [class]="ui.td"><span class="flex items-center gap-3"><span class="size-7 animate-pulse rounded-full bg-bg"></span><span class="h-3 w-64 animate-pulse rounded bg-bg"></span></span></td>
                        <td [class]="ui.td + ' max-md:hidden'"><span class="block h-3 w-20 animate-pulse rounded bg-bg"></span></td>
                        <td [class]="ui.td"><span class="ml-auto block h-3 w-10 animate-pulse rounded bg-bg"></span></td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </section>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">What gets recorded</h2>
            <a [routerLink]="ctx.base() + '/logs'" class="text-[13px] text-link hover:underline">Traffic logs</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              The 50 most recent changes to this mailbox: creation, suspension, passwords, forwards, identities and
              settings. Messages it sent or received are in the traffic logs.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">The whole domain</h2>
            <a [routerLink]="'/domains/' + ctx.domainId() + '/activity'" class="text-[13px] text-link hover:underline">Domain activity</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Changes to every mailbox and alias on this domain are listed together in the domain's activity.
            </p>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxActivity {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;
  protected readonly dot = DOT;
  protected readonly icon = ICON;
  protected readonly label: Record<Exclude<Category, 'all'>, string> = { mailbox: 'Mailbox', access: 'Sign-in and access', delivery: 'Delivery' };
  protected readonly choiceOn = UI.choiceOn + ' text-ink';
  // Day rows in the table, like the domain's activity.
  protected readonly groupRow = 'bg-bg/40 px-4 py-1.5 text-[12px] font-medium text-muted';

  protected readonly entries = perMailbox((id) => this.api.activity(id));

  protected readonly filters: { value: Category; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'mailbox', label: 'Mailbox' },
    { value: 'access', label: 'Sign-in and access' },
    { value: 'delivery', label: 'Delivery' },
  ];
  protected readonly filter = signal<Category>('all');

  protected readonly days = computed(() => {
    const entries = this.entries();
    if (!entries) return undefined;
    const filter = this.filter();
    const days: { day: string; rows: Row[] }[] = [];
    for (const entry of entries) {
      const row = toRow(entry);
      if (filter !== 'all' && row.category !== filter) continue;
      const day = localDay(new Date(entry.createdAt));
      const last = days[days.length - 1];
      if (last?.day === day) last.rows.push(row);
      else days.push({ day, rows: [row] });
    }
    return days;
  });

  protected readonly chips = computed(() => {
    const entries = this.entries();
    const counts: Record<string, number> = {};
    for (const entry of entries ?? []) {
      const category = toRow(entry).category;
      counts[category] = (counts[category] ?? 0) + 1;
    }
    return this.filters.map((option) => ({
      ...option,
      count: !entries ? null : option.value === 'all' ? entries.length : (counts[option.value] ?? 0),
    }));
  });

  protected dayLabel(day: string): string {
    const today = new Date();
    if (day === localDay(today)) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (day === localDay(yesterday)) return 'Yesterday';
    return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
}

function toRow(entry: ActivityEntry): Row {
  const type = entry.eventType.replace(/^admin\./, '');
  const action = type.split('.').slice(1).join('.');
  const category = CATEGORY_BY_ACTION.find(([pattern]) => pattern.test(action))?.[1] ?? 'mailbox';
  // Failures, suspensions and deletions keep the red and amber the old dots had, whatever their category.
  let tile = TILE[category];
  if (type.endsWith('_failed')) tile = 'bg-bad/15 text-bad';
  else if (type === 'mailbox.suspended' || type === 'mailbox.deleted') tile = 'bg-warn/15 text-warn';
  return { entry, category, tile, bySupport: entry.eventType.startsWith('admin.') };
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
