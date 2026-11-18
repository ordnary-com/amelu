import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, SupportTicket, errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { UI } from '../ui';
import { SupportTips } from './support-tips';
import { CATEGORY_LABEL, STATUS, timeAgo } from './support-meta';

/** /support: the organization's tickets, newest activity first. */
@Component({
  selector: 'amelu-support-home',
  imports: [RouterLink, Alert, Icon, SupportTips],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div class="min-w-0">
        <h1 class="text-[22px] leading-tight font-normal">Support</h1>
        <p class="mt-1 text-[14px] text-muted">Ask our team about your account, domains, DNS or mail delivery. Everyone in your organization can follow the tickets here.</p>
      </div>
      <a routerLink="/support/new" class="inline-flex h-10 flex-none items-center gap-1.5 rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent/85">
        New ticket
        <amelu-icon name="plus" [size]="16" />
      </a>
    </div>

    <div class="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <section [class]="ui.panel">
        <div [class]="ui.panelHeader + ' h-auto min-h-11 flex-wrap py-2'">
          <h2 [class]="ui.panelTitle">
            Tickets
            @if (tickets(); as list) {
              <span class="font-normal text-muted">({{ list.length }})</span>
            }
          </h2>
          @if (tickets()?.length) {
            <div class="flex gap-1" role="tablist" aria-label="Filter tickets">
              @for (f of filters; track f.id) {
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="filter() === f.id"
                  class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[13px]"
                  [class]="filter() === f.id ? 'bg-accent/10 font-medium text-link' : 'text-muted hover:bg-bg hover:text-ink'"
                  (click)="filter.set(f.id)"
                >
                  {{ f.label }}
                  <span class="tabular-nums" [class.text-muted]="filter() !== f.id">{{ count(f.id) }}</span>
                </button>
              }
            </div>
          }
        </div>
        <div [class]="ui.well">
          @if (error(); as message) {
            <amelu-alert class="mb-3 block">{{ message }}</amelu-alert>
          }
          <div [class]="ui.tableWrap">
            <table [class]="ui.table">
              <thead>
                <tr [class.text-muted]="!visible().length">
                  <th [class]="ui.th">Subject</th>
                  <th [class]="ui.th">Status</th>
                  <th [class]="ui.th + ' max-lg:hidden'">Opened by</th>
                  <th [class]="ui.th + ' max-sm:hidden'">Updated</th>
                </tr>
              </thead>
              <tbody>
                @if (tickets() === undefined) {
                  @for (i of [1, 2]; track i) {
                    <tr [class]="ui.tr" aria-hidden="true"><td [class]="ui.td" colspan="4"><span class="block h-3 w-full animate-pulse rounded bg-bg"></span></td></tr>
                  }
                } @else {
                  @for (t of visible(); track t.id) {
                    <tr [class]="ui.tr">
                      <td [class]="ui.td + ' max-w-[380px]'">
                        <a [routerLink]="['/support/tickets', t.id]" class="block truncate font-medium text-link hover:underline">{{ t.subject }}</a>
                        <span [class]="ui.tdSub"><span class="truncate">#{{ t.number }} · {{ categoryLabel[t.category] }}@if (t.domainName) { · {{ t.domainName }} }</span></span>
                      </td>
                      <td [class]="ui.td">
                        <span class="inline-flex items-center gap-1.5 whitespace-nowrap" [class]="status[t.status].text">
                          <amelu-icon [name]="status[t.status].icon" [size]="16" />{{ status[t.status].label }}
                        </span>
                      </td>
                      <td [class]="ui.td + ' max-w-[180px] truncate max-lg:hidden'">{{ t.openedByName }}</td>
                      <td [class]="ui.td + ' whitespace-nowrap text-muted max-sm:hidden'">{{ ago(t.updatedAt) }}</td>
                    </tr>
                  } @empty {
                    <tr [class]="ui.tr">
                      <td colspan="4" class="px-4 py-10 text-center">
                        <amelu-icon name="lifebuoy" [size]="18" class="mx-auto block" />
                        @if (tickets()?.length) {
                          <p class="mt-2">No {{ filterLabel() }} tickets</p>
                        } @else {
                          <p class="mt-2">No tickets yet</p>
                          <p class="mt-0.5 text-[13px] text-muted">When something isn't working, open a ticket and we'll answer here and by email.</p>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <aside class="space-y-5">
        <amelu-support-tips [showStatus]="false" />
        <section [class]="ui.setCard">
          <div [class]="ui.setHeader">
            <h2 [class]="ui.setTitle">Service Status</h2>
            <a routerLink="/status" [class]="ui.setAction" aria-label="Service status" title="Service status"><amelu-icon name="arrowRight" [size]="17" /></a>
          </div>
          <p class="px-5 py-4 text-[14px] text-muted">Check for known incidents before opening a ticket.</p>
        </section>
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
