import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { injectDomain } from '../domain-context';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { DnsSpamApi, SpamOverview as Overview } from './dns-spam-api';
import { spamCrumbs } from './spam-form';
import { SPAM_TABS, SectionTabs } from '../section-tabs';

interface Row {
  label: string;
  hint: string;
  link: string;
}

/** Replaces frontend/src/pages/SpamOverviewPage.tsx. */
@Component({
  selector: 'amelu-spam-overview',
  imports: [SectionTabs, EmptyState, Icon, PageHeader, RouterLink],
  template: `
    <amelu-page-header title="Spam filtering" [crumbs]="crumbs()">
      How incoming mail for {{ ctx.domain()?.name ?? 'this domain' }} is filtered, on top of the spam score every message gets.
    </amelu-page-header>

    <amelu-section-tabs label="Spam filtering" [base]="'/domains/' + ctx.id()" [tabs]="tabs" />

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        @if (overview() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The spam settings couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.panel">
            <div [class]="ui.panelHeader">
              <h2 [class]="ui.panelTitle">Subject handling</h2>
              <a [routerLink]="'/domains/' + ctx.id() + '/spam/subject'" class="text-[13px] text-link hover:underline">Change</a>
            </div>
            <div [class]="ui.well">
              <ul class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
                @if (toggles(); as list) {
                  @for (row of list; track row.label) {
                    <li>
                      <a [routerLink]="row.link" class="group flex items-center gap-3 px-4 py-2.5 hover:bg-bg/40">
                        <span
                          class="inline-flex size-5 flex-none items-center justify-center rounded-full"
                          [class]="row.on ? 'bg-ok text-white' : 'bg-bg text-muted'"
                          aria-hidden="true"
                        >
                          @if (row.on) {
                            <amelu-icon name="check" [size]="12" />
                          }
                        </span>
                        <span class="min-w-0 flex-1">
                          <span class="block text-[13px] font-medium">{{ row.label }}</span>
                          <span class="block truncate text-[12px] text-muted">{{ row.hint }}</span>
                        </span>
                        <span class="flex-none text-[12px]" [class]="row.on ? 'text-ok' : 'text-muted'">{{ row.on ? 'On' : 'Off' }}</span>
                        <amelu-icon name="chevronRight" [size]="14" class="flex-none text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                      </a>
                    </li>
                  }
                } @else {
                  @for (i of [1, 2]; track i) {
                    <li class="flex items-center gap-3 px-4 py-2.5" aria-hidden="true">
                      <span class="size-5 flex-none animate-pulse rounded-full bg-bg"></span>
                      <span class="flex-1 space-y-2">
                        <span class="block h-3 w-48 animate-pulse rounded bg-bg"></span>
                        <span class="block h-2.5 w-64 animate-pulse rounded bg-bg"></span>
                      </span>
                    </li>
                  }
                }
              </ul>
            </div>
          </section>

          <section [class]="ui.panel">
            <div [class]="ui.panelHeader">
              <h2 [class]="ui.panelTitle">Lists</h2>
            </div>
            <div [class]="ui.well">
              <div [class]="ui.tableWrap">
                <table [class]="ui.table">
                  <thead>
                    <tr>
                      <th [class]="ui.th">List</th>
                      <th [class]="ui.th + ' text-right'">Entries</th>
                      <th class="w-0 pr-3" aria-label="Open"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @if (lists(); as list) {
                      @for (row of list; track row.label) {
                        <tr [class]="ui.tr + ' group cursor-pointer hover:bg-bg/40'" [routerLink]="row.link">
                          <td [class]="ui.td">
                            <a [routerLink]="row.link" class="text-link group-hover:underline">{{ row.label }}</a>
                            <span [class]="ui.tdSub">{{ row.hint }}</span>
                          </td>
                          <td [class]="ui.td + ' text-right tabular-nums'" [class.text-muted]="!row.count">{{ row.count }}</td>
                          <td class="w-0 pr-3 text-right">
                            <amelu-icon name="chevronRight" [size]="14" class="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                          </td>
                        </tr>
                      }
                    } @else {
                      @for (i of [1, 2, 3]; track i) {
                        <tr [class]="ui.tr" aria-hidden="true">
                          <td [class]="ui.td"><span class="block h-3 w-32 animate-pulse rounded bg-bg"></span><span class="mt-2 block h-2.5 w-56 animate-pulse rounded bg-bg"></span></td>
                          <td [class]="ui.td"><span class="ml-auto block h-3 w-6 animate-pulse rounded bg-bg"></span></td>
                          <td></td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        }
      </div>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">How filtering works</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Every incoming message is scored across many tests. Messages that score as spam go to the recipient's Junk
              folder. The lists here drop or junk specific senders and recipients on top of that.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Not adjustable per domain</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Detection sensitivity and a sender allowlist that skips spam scoring aren't available. Both would change
              settings shared by every domain on our mail servers, which isn't safe to open up per domain.
            </p>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SpamOverview {
  private readonly api = inject(DnsSpamApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly crumbs = spamCrumbs(this.ctx);
  protected readonly tabs = SPAM_TABS;

  // undefined while loading, null when the request failed
  protected readonly overview = toSignal(
    toObservable(this.ctx.id).pipe(
      switchMap((id) =>
        this.api.spamOverview(id).pipe(
          map((value): Overview | null => value),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
    { initialValue: undefined },
  );

  protected readonly toggles = computed<(Row & { on: boolean })[] | null>(() => {
    const overview = this.overview();
    if (!overview) return null;
    const base = '/domains/' + this.ctx.id() + '/spam/';
    return [
      { label: 'Subject rewriting', hint: 'Prefix the subject of junk with "SPAM"', link: base + 'subject', on: overview.subjectRewrite },
      { label: 'Junk if subject contains "SPAM"', hint: 'Case insensitive', link: base + 'subject', on: overview.junkIfSubjectSpam },
    ];
  });

  protected readonly lists = computed<(Row & { count: number })[] | null>(() => {
    const overview = this.overview();
    if (!overview) return null;
    const base = '/domains/' + this.ctx.id() + '/spam/';
    return [
      { label: 'Sender denylist', hint: 'Senders whose mail is dropped', link: base + 'sender-lists', count: overview.senderDenylistCount },
      { label: 'Sender junklist', hint: 'Senders whose mail goes to Junk', link: base + 'sender-lists', count: overview.senderJunklistCount },
      { label: 'Recipient denylist', hint: 'Addresses on this domain that never receive mail', link: base + 'recipient-denylist', count: overview.recipientDenylistCount },
    ];
  });
}
