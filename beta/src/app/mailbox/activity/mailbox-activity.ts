import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ActivityEntry } from '../../api';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

/** The current dashboard's MailboxRecentActivityPage, grouped by day. */
@Component({
  selector: 'amelu-mailbox-activity',
  imports: [DatePipe, RouterLink, EmptyState, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Recent activity">The last events recorded for this mailbox.</amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        @if (days(); as groups) {
          @for (group of groups; track group.day) {
            <section>
              <h2 class="mb-2 text-[12px] font-bold tracking-wide text-muted uppercase">{{ dayLabel(group.day) }}</h2>
              <ol [class]="ui.card + ' overflow-hidden'">
                @for (entry of group.entries; track entry.id) {
                  <li class="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <span class="mt-[7px] size-2 flex-none rounded-full" [class]="dot(entry)"></span>
                    <p class="min-w-0 flex-1 text-[13px] break-words">{{ entry.message }}</p>
                    <time class="flex-none text-[12px] text-muted tabular-nums">{{ entry.createdAt | date: 'HH:mm' }}</time>
                  </li>
                }
              </ol>
            </section>
          } @empty {
            <amelu-empty-state [class]="ui.card" title="No activity recorded yet" illustration="in-progress">
              Changes to this mailbox, like a new password or forward, show up here.
            </amelu-empty-state>
          }
        } @else if (entries() === null) {
          <amelu-empty-state [class]="ui.card" title="Activity couldn't be loaded" [error]="true" />
        } @else {
          <div [class]="ui.card + ' overflow-hidden'" aria-hidden="true">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span class="size-2 animate-pulse rounded-full bg-bg"></span>
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
          <a [routerLink]="ctx.base() + '/logs'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Traffic logs
          </a>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">The whole domain</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Changes to every mailbox and alias on this domain are listed together in the domain's activity.
          </p>
          <a [routerLink]="'/domains/' + ctx.domainId() + '/activity'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
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

  protected readonly entries = perMailbox((id) => this.api.activity(id));

  protected readonly days = computed(() => {
    const entries = this.entries();
    if (!entries) return undefined;
    const days: { day: string; entries: ActivityEntry[] }[] = [];
    for (const entry of entries) {
      const day = localDay(new Date(entry.createdAt));
      const last = days[days.length - 1];
      if (last?.day === day) last.entries.push(entry);
      else days.push({ day, entries: [entry] });
    }
    return days;
  });

  protected dot(entry: ActivityEntry): string {
    if (entry.eventType.endsWith('_failed')) return 'bg-bad';
    if (entry.eventType === 'mailbox.suspended' || entry.eventType === 'mailbox.deleted') return 'bg-warn';
    return 'bg-ok';
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

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
