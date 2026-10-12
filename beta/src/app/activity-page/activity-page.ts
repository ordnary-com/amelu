import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Api, AuditEntry, errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { EmptyState } from '../empty-state/empty-state';

type Category = 'all' | 'team' | 'domains' | 'mailboxes' | 'billing' | 'account';

// Which filter an action belongs to, by the part before the first dot.
const CATEGORY_BY_PREFIX: Record<string, Exclude<Category, 'all'>> = {
  invitation: 'team',
  member: 'team',
  organization: 'team',
  domain: 'domains',
  domain_alias: 'domains',
  catchall: 'domains',
  alias: 'mailboxes',
  bcc_capture: 'mailboxes',
  mailbox: 'mailboxes',
  billing: 'billing',
  api_key: 'account',
  account: 'account',
};

const DOT: Record<Exclude<Category, 'all'>, string> = {
  team: 'bg-[#a371f7]',
  domains: 'bg-accent',
  mailboxes: 'bg-ok',
  billing: 'bg-warn',
  account: 'bg-muted',
};

interface Row {
  entry: AuditEntry;
  category: Exclude<Category, 'all'>;
  text: string;
}

/** The current dashboard's /organization/activity, grouped by day with a filter. */
@Component({
  selector: 'amelu-activity-page',
  imports: [EmptyState, DatePipe, Alert],
  templateUrl: './activity-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ActivityPage {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly dot = DOT;

  protected readonly filters: { value: Category; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'team', label: 'Team' },
    { value: 'domains', label: 'Domains' },
    { value: 'mailboxes', label: 'Mailboxes' },
    { value: 'billing', label: 'Billing' },
    { value: 'account', label: 'Account' },
  ];

  // undefined while loading
  protected readonly entries = signal<AuditEntry[] | undefined>(undefined);
  protected readonly filter = signal<Category>('all');
  protected readonly error = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly exhausted = signal(false);

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

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.entries.set(await firstValueFrom(this.api.listAudit()));
    } catch (err) {
      this.entries.set([]);
      this.error.set(errorMessage(err, 'Could not load activity'));
    }
  }

  protected async loadMore(): Promise<void> {
    const entries = this.entries();
    if (!entries?.length) return;
    this.loadingMore.set(true);
    try {
      const next = await firstValueFrom(this.api.listAudit(entries[entries.length - 1].createdAt));
      if (next.length === 0) this.exhausted.set(true);
      this.entries.set([...entries, ...next]);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not load more activity'));
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected dayLabel(day: string): string {
    const today = new Date();
    if (day === localDay(today)) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (day === localDay(yesterday)) return 'Yesterday';
    return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
}

// "mailbox.password_invite_sent" -> "Mailbox password invite sent"
function toRow(entry: AuditEntry): Row {
  const parts = entry.action.replace(/^admin\./, '').split('.');
  const words = parts.join(' ').replace(/_/g, ' ');
  return {
    entry,
    category: CATEGORY_BY_PREFIX[parts[0]] ?? 'account',
    text: (words.charAt(0).toUpperCase() + words.slice(1)).replace(/\bapi\b/gi, 'API'),
  };
}

// YYYY-MM-DD in the viewer's timezone, so "Today" matches their clock.
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
