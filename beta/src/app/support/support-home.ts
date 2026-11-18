import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, SupportTicket, errorMessage } from '../api';
import { PageHeader } from '../page-header/page-header';
import { EmptyState } from '../empty-state/empty-state';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { UI } from '../ui';
import { CATEGORY_LABEL, STATUS, timeAgo } from './support-meta';

/** /support: the organization's tickets, newest activity first. */
@Component({
  selector: 'amelu-support-home',
  imports: [PageHeader, RouterLink, EmptyState, Alert, Icon],
  template: `
    <amelu-page-header title="Support">
      Ask our team about your account, domains, DNS or mail delivery. Everyone in your organization can follow the tickets here.
      <a actions routerLink="/support/new" [class]="ui.primary">
        <amelu-icon name="plus" [size]="14" />
        New ticket
      </a>
    </amelu-page-header>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <section class="min-w-0">
        @if (error(); as message) {
          <amelu-alert class="mb-4 block">{{ message }}</amelu-alert>
        }

        @if (tickets(); as list) {
          @if (list.length) {
            <div class="mb-3 flex gap-1" role="tablist" aria-label="Filter tickets">
              @for (f of filters; track f.id) {
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="filter() === f.id"
                  class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px]"
                  [class]="filter() === f.id ? 'bg-accent/10 font-medium text-ink' : 'text-muted hover:bg-bg hover:text-ink'"
                  (click)="filter.set(f.id)"
                >
                  {{ f.label }}
                  <span class="rounded bg-bg px-1.5 text-[11px] tabular-nums text-muted">{{ count(f.id) }}</span>
                </button>
              }
            </div>

            @if (visible().length) {
              <ul [class]="ui.card + ' divide-y divide-line overflow-hidden'">
                @for (t of visible(); track t.id) {
                  <li>
                    <a [routerLink]="['/support/tickets', t.id]" class="flex items-start gap-3 px-4 py-3 hover:bg-bg/60">
                      <span class="mt-1.5 size-2 flex-none rounded-full" [class]="status[t.status].dot" aria-hidden="true"></span>
                      <span class="min-w-0 flex-1">
                        <span class="flex items-baseline gap-2">
                          <span class="truncate text-[14px] font-medium">{{ t.subject }}</span>
                          <span class="flex-none text-[12px] text-muted tabular-nums">#{{ t.number }}</span>
                        </span>
                        <span class="mt-0.5 block truncate text-[12px] text-muted">
                          {{ categoryLabel[t.category] }}@if (t.domainName) { · {{ t.domainName }} } · opened by {{ t.openedByName }}
                        </span>
                      </span>
                      <span class="flex flex-none flex-col items-end gap-1">
                        <span class="rounded px-1.5 py-0.5 text-[11px] font-medium" [class]="status[t.status].badge">{{ status[t.status].label }}</span>
                        <span class="text-[12px] text-muted">{{ ago(t.updatedAt) }}</span>
                      </span>
                    </a>
                  </li>
                }
              </ul>
            } @else {
              <p [class]="ui.card + ' px-4 py-8 text-center text-[13px] text-muted'">No {{ filterLabel() }} tickets.</p>
            }
          } @else {
            <div [class]="ui.card">
              <amelu-empty-state title="No tickets yet" illustration="confidential-letter">
                When something isn't working, open a ticket and we'll answer here and by email.
              </amelu-empty-state>
            </div>
          }
        } @else {
          <div [class]="ui.card + ' h-40 animate-pulse'"></div>
        }
      </section>

      <aside class="space-y-3">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Get a faster answer</h2>
          <ul class="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted">
            <li>Name the domain and the address involved.</li>
            <li>Say roughly when it happened.</li>
            <li>Paste the full error or bounce message.</li>
          </ul>
        </section>
        <a routerLink="/status" [class]="ui.card + ' group flex items-start gap-3 p-4 hover:border-ink/20'">
          <amelu-icon name="pulse" [size]="16" class="mt-0.5 flex-none text-accent" />
          <span class="min-w-0 flex-1">
            <span class="block text-[14px] font-bold">Service status</span>
            <span class="mt-0.5 block text-[13px] text-muted">Check for known incidents before opening a ticket.</span>
          </span>
          <amelu-icon name="chevronRight" [size]="14" class="mt-1 flex-none text-muted group-hover:text-ink" />
        </a>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SupportHome {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly status = STATUS;
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly filters = [
    { id: 'active', label: 'Active' },
    { id: 'closed', label: 'Closed' },
    { id: 'all', label: 'All' },
  ] as const;

  // undefined while loading
  protected readonly tickets = signal<SupportTicket[] | undefined>(undefined);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<'active' | 'closed' | 'all'>('active');

  protected readonly visible = computed(() => (this.tickets() ?? []).filter((t) => this.matches(t, this.filter())));
  protected readonly filterLabel = computed(() => ({ all: '', active: 'active', closed: 'closed' })[this.filter()]);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.tickets.set(await firstValueFrom(this.api.listSupportTickets()));
    } catch (err) {
      this.tickets.set([]);
      this.error.set(errorMessage(err, 'Could not load your tickets'));
    }
  }

  private matches(t: SupportTicket, f: 'active' | 'closed' | 'all'): boolean {
    return f === 'all' || (f === 'closed' ? t.status === 'closed' : t.status !== 'closed');
  }

  protected count(f: 'active' | 'closed' | 'all'): number {
    return (this.tickets() ?? []).filter((t) => this.matches(t, f)).length;
  }

  protected ago(iso: string): string {
    return timeAgo(iso);
  }
}
