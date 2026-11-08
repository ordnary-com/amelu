import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { injectDomain } from '../../domain-context';
import { PageHeader } from '../../page-header/page-header';
import { EmptyState } from '../../empty-state/empty-state';
import { formatBytes } from '../../format-bytes';
import { UI } from '../../ui';
import { badgeClass } from '../../status';
import { MailboxStorage, MailboxesApi } from '../mailboxes-api';

const NEAR_FULL = 0.85;

/** Who uses how much storage on one domain, biggest first. */
@Component({
  selector: 'amelu-mailbox-storage-page',
  imports: [RouterLink, PageHeader, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <amelu-page-header title="Storage" [crumbs]="crumbs()">
      How much mail each mailbox on {{ ctx.domain()?.name }} holds, biggest first.
    </amelu-page-header>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <section class="min-w-0">
        <h2 class="mb-3 flex items-center gap-2 text-[14px] font-bold">
          By mailbox
          @if (rows(); as list) {
            <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ list.length }}</span>
          }
        </h2>
        <div [class]="ui.card + ' divide-y divide-line overflow-hidden'">
          @if (rows() === null) {
            <amelu-empty-state title="Storage couldn't be loaded" [error]="true">The mail cluster didn't answer. Try again in a minute.</amelu-empty-state>
          } @else if (rows(); as list) {
            @for (row of list; track row.mailboxId) {
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <a [routerLink]="base() + '/mailboxes/' + row.mailboxId" class="min-w-0 flex-1 truncate text-[13px] font-medium hover:text-link">{{ row.address }}</a>
                <span class="text-[12px] tabular-nums text-muted">
                  {{ size(row.usedBytes) }}@if (row.limitBytes) { of {{ size(row.limitBytes) }} }
                </span>
                @if (row.near) {
                  <span [class]="nearBadge">Nearly full</span>
                }
                <a [routerLink]="base() + '/mailboxes/' + row.mailboxId + '/limits'" class="text-[12px] font-medium text-link hover:underline">Limit</a>
                <div class="h-1 w-full overflow-hidden rounded-full bg-bg">
                  <div class="h-full rounded-full" [class]="row.near ? 'bg-warn' : 'bg-accent'" [style.width.%]="row.percent"></div>
                </div>
              </div>
            } @empty {
              <amelu-empty-state title="No mailboxes yet">Mailboxes you add show up here with their storage.</amelu-empty-state>
            }
          } @else {
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="space-y-2 px-4 py-3.5" aria-hidden="true">
                <span class="block h-3 w-48 animate-pulse rounded bg-bg"></span>
                <span class="block h-1 w-full animate-pulse rounded bg-bg"></span>
              </div>
            }
          }
        </div>
      </section>

      <aside class="space-y-6">
        @if (totals(); as t) {
          <section [class]="ui.card + ' px-4 pt-3 pb-4'">
            <p class="text-[12px] text-muted">Total on this domain</p>
            <p class="mt-1 text-[26px] leading-tight font-normal tracking-[-0.01em] tabular-nums">{{ size(t.used) }}</p>
            <p class="mt-2 text-[12px] text-muted">
              {{ t.count }} mailboxes@if (t.near) {, {{ t.near }} nearly full}
            </p>
          </section>
        }
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">About storage</h2>
          <ul class="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted">
            <li>A mailbox without a limit of its own shows its size against the biggest one here.</li>
            <li>Nearly full means 85% or more of its limit. A full mailbox stops receiving mail.</li>
            <li>Set a limit for many mailboxes at once from the mailbox list.</li>
          </ul>
        </section>
      </aside>
    </div>
  `,
})
export class MailboxStoragePage {
  private readonly api = inject(MailboxesApi);
  protected readonly ctx = injectDomain();
  protected readonly ui = UI;
  protected readonly nearBadge = badgeClass('warn');
  protected readonly size = formatBytes;
  protected readonly base = computed(() => `/domains/${this.ctx.id()}`);
  protected readonly crumbs = computed(() => [
    { label: 'Domains', link: '/domains' },
    { label: this.ctx.domain()?.name ?? '', link: this.base() },
    { label: 'Mailboxes', link: this.base() + '/mailboxes' },
    { label: 'Storage' },
  ]);

  // undefined while loading, null when the request failed
  private readonly storage = toSignal(
    toObservable(this.ctx.id).pipe(
      switchMap((id) =>
        this.api.storage(id).pipe(
          map((list): MailboxStorage[] | null => list),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );

  protected readonly rows = computed(() => {
    const list = this.storage();
    if (!list) return list;
    const biggest = Math.max(1, ...list.map((r) => r.usedBytes));
    return [...list]
      .sort((a, b) => b.usedBytes - a.usedBytes || a.address.localeCompare(b.address))
      .map((r) => ({
        ...r,
        percent: Math.min(100, (r.usedBytes / (r.limitBytes || biggest)) * 100),
        near: r.limitBytes > 0 && r.usedBytes / r.limitBytes >= NEAR_FULL,
      }));
  });

  protected readonly totals = computed(() => {
    const rows = this.rows();
    if (!rows) return null;
    return { used: rows.reduce((n, r) => n + r.usedBytes, 0), count: rows.length, near: rows.filter((r) => r.near).length };
  });
}
