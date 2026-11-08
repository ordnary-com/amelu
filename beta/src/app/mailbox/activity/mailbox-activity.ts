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
import { DitherShader } from '../../login/dither-shader';

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
  imports: [DatePipe, RouterLink, EmptyState, MailboxHeading, Icon, DitherShader],
  template: `
    <amelu-mailbox-heading title="Recent activity">The last events recorded for this mailbox.</amelu-mailbox-heading>

    <div class="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter activity">
      @for (option of chips(); track option.value) {
        <button
          type="button"
          class="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors"
          [class]="filter() === option.value ? 'border-accent/40 bg-accent/10 text-ink' : 'border-line bg-surface text-muted hover:border-ink/20 hover:text-ink'"
          [attr.aria-pressed]="filter() === option.value"
          (click)="filter.set(option.value)"
        >
          @if (option.value !== 'all') {
            <span class="size-1.5 rounded-full" [class]="dot[option.value]" aria-hidden="true"></span>
          }
          {{ option.label }}
          @if (option.count !== null) {
            <span class="text-[12px] font-normal text-muted tabular-nums">{{ option.count }}</span>
          }
        </button>
      }
    </div>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        @if (days(); as groups) {
          @for (group of groups; track group.day) {
            <section>
              <h2 class="mb-3 flex items-center gap-2 text-[14px] font-bold">
                {{ dayLabel(group.day) }}
                <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ group.rows.length }}</span>
              </h2>
              <ol [class]="ui.card + ' px-4 py-1'">
                @for (row of group.rows; track row.entry.id; let last = $last) {
                  <li class="relative flex items-start gap-3 py-3">
                    @if (!last) {
                      <span class="absolute top-[46px] -bottom-1 left-4 w-px bg-line" aria-hidden="true"></span>
                    }
                    <span class="relative inline-flex size-8 flex-none items-center justify-center rounded-full" [class]="row.tile" aria-hidden="true">
                      <amelu-icon [name]="icon[row.category]" [size]="15" />
                    </span>
                    <div class="min-w-0 flex-1 pt-1.5">
                      <p class="text-[13px] break-words">{{ row.entry.message }}</p>
                      @if (row.bySupport) {
                        <span class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">
                          <amelu-icon name="lifebuoy" [size]="11" />
                          By Amelu support
                        </span>
                      }
                    </div>
                    <time class="flex-none pt-1.5 text-[12px] text-muted tabular-nums" [attr.datetime]="row.entry.createdAt" [title]="row.entry.createdAt | date: 'd MMM y, HH:mm:ss'">
                      {{ row.entry.createdAt | date: 'HH:mm' }}
                    </time>
                  </li>
                }
              </ol>
            </section>
          } @empty {
            @if (filter() === 'all') {
              <amelu-empty-state [class]="ui.card" title="No activity recorded yet" illustration="in-progress">
                Changes to this mailbox, like a new password or forward, show up here.
              </amelu-empty-state>
            } @else {
              <amelu-empty-state [class]="ui.card" title="Nothing in this category" illustration="no-data">
                None of the recent events are of this kind.
                <button actions type="button" [class]="ui.outline" (click)="filter.set('all')">Show all</button>
              </amelu-empty-state>
            }
          }
        } @else if (entries() === null) {
          <amelu-empty-state [class]="ui.card" title="Activity couldn't be loaded" [error]="true" />
        } @else {
          <div [class]="ui.card + ' divide-y divide-line overflow-hidden'" aria-hidden="true">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="flex items-center gap-3 px-4 py-3">
                <span class="size-8 animate-pulse rounded-full bg-bg"></span>
                <span class="h-3 w-64 animate-pulse rounded bg-bg"></span>
              </div>
            }
          </div>
        }
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">What's listed</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            The 50 most recent changes to this mailbox: creation, suspension, passwords, forwards, identities and
            settings. Messages it sent or received are in the traffic logs.
          </p>
          <a [routerLink]="ctx.base() + '/logs'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">Traffic logs</a>
        </section>
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="globe" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">The whole domain</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Changes to every mailbox and alias on this domain are listed together in the domain's activity.
          </p>
          <a [routerLink]="'/domains/' + ctx.domainId() + '/activity'" class="mt-4 inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-[13px] font-medium hover:border-ink/20 hover:bg-bg">
            Domain activity
          </a>
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
