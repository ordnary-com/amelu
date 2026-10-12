import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { ActivityEntry, Api } from '../api';
import { injectDomain } from '../domain-context';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';

type Category = 'all' | 'domain' | 'mailboxes' | 'spam';

// Which filter an event belongs to, by the part before the first dot.
const CATEGORY_BY_PREFIX: Record<string, Exclude<Category, 'all'>> = {
  domain: 'domain',
  domain_alias: 'domain',
  catchall: 'domain',
  pattern_rewrite: 'domain',
  bcc_capture: 'domain',
  mailbox: 'mailboxes',
  alias: 'mailboxes',
  spam: 'spam',
  spam_rules: 'spam',
};

const DOT: Record<Exclude<Category, 'all'>, string> = {
  domain: 'bg-accent',
  mailboxes: 'bg-ok',
  spam: 'bg-warn',
};

interface Row {
  entry: ActivityEntry;
  category: Exclude<Category, 'all'>;
  bySupport: boolean;
}

@Component({
  selector: 'amelu-domain-activity',
  imports: [PageHeader, EmptyState, DatePipe, RouterLink],
  templateUrl: './domain-activity.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DomainActivity {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly dot = DOT;

  protected readonly filters: { value: Category; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'domain', label: 'Domain' },
    { value: 'mailboxes', label: 'Mailboxes' },
    { value: 'spam', label: 'Spam filtering' },
  ];
  protected readonly filter = signal<Category>('all');

  // undefined while loading, null when the request failed
  protected readonly entries = toSignal(
    toObservable(this.ctx.id).pipe(
      switchMap((id) =>
        this.api.domainActivity(id).pipe(
          map((list): ActivityEntry[] | null | undefined => list),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
    { initialValue: undefined },
  );

  protected readonly days = computed(() => {
    const entries = this.entries();
    if (!entries) return entries;
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

  protected readonly summary = computed(() => {
    const counts: Record<string, number> = {};
    for (const entry of this.entries() ?? []) {
      const category = toRow(entry).category;
      counts[category] = (counts[category] ?? 0) + 1;
    }
    return this.filters
      .filter((option): option is { value: Exclude<Category, 'all'>; label: string } => option.value !== 'all')
      .map((option) => ({ ...option, count: counts[option.value] ?? 0 }));
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
  const bySupport = entry.eventType.startsWith('admin.');
  const prefix = entry.eventType.replace(/^admin\./, '').split('.')[0];
  return { entry, category: CATEGORY_BY_PREFIX[prefix] ?? 'domain', bySupport };
}

// YYYY-MM-DD in the viewer's timezone, so "Today" matches their clock.
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
