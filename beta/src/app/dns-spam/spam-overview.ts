import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { injectDomain } from '../domain-context';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { PageHeader } from '../page-header/page-header';
import { badgeClass } from '../status';
import { UI } from '../ui';
import { DnsSpamApi, SpamOverview as Overview } from './dns-spam-api';
import { spamCrumbs } from './spam-form';

interface Row {
  label: string;
  hint: string;
  link: string;
  badge?: { label: string; class: string };
  count?: number;
}

/** Replaces frontend/src/pages/SpamOverviewPage.tsx. */
@Component({
  selector: 'amelu-spam-overview',
  imports: [EmptyState, Icon, PageHeader, RouterLink],
  template: `
    <amelu-page-header title="Spam filtering" [crumbs]="crumbs()">
      How incoming mail for {{ ctx.domain()?.name ?? 'this domain' }} is filtered, on top of the spam scoring every
      message gets.
    </amelu-page-header>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <section class="min-w-0">
        <h2 [class]="ui.sectionTitle">Settings</h2>
        <div [class]="ui.card + ' overflow-hidden'">
          @if (rows(); as list) {
            <ul>
              @for (row of list; track row.label) {
                <li class="border-b border-line last:border-b-0">
                  <a [routerLink]="row.link" class="group flex items-center gap-3 px-4 py-3 hover:bg-bg/60">
                    <span class="min-w-0 flex-1">
                      <span class="block text-[14px] font-medium group-hover:underline">{{ row.label }}</span>
                      <span class="block text-[12px] text-muted">{{ row.hint }}</span>
                    </span>
                    @if (row.badge; as badge) {
                      <span [class]="badge.class">{{ badge.label }}</span>
                    } @else {
                      <span class="text-[13px] text-muted">{{ row.count }} {{ row.count === 1 ? 'entry' : 'entries' }}</span>
                    }
                    <amelu-icon name="chevronRight" [size]="14" class="text-muted" />
                  </a>
                </li>
              }
            </ul>
          } @else if (overview() === null) {
            <amelu-empty-state title="The spam settings couldn't be loaded" [error]="true" />
          } @else {
            @for (i of [1, 2, 3, 4, 5]; track i) {
              <div class="space-y-2 border-b border-line px-4 py-3 last:border-b-0" aria-hidden="true">
                <span class="block h-3 w-40 animate-pulse rounded bg-bg"></span>
                <span class="block h-3 w-64 animate-pulse rounded bg-bg"></span>
              </div>
            }
          }
        </div>
      </section>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">How filtering works</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Every incoming message is scored across many tests. Messages that score as spam go to the recipient's Junk
            folder. The lists here let you drop or junk specific senders and recipients on top of that.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Not adjustable per domain</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Detection sensitivity (aggressiveness) and a sender allowlist that bypasses spam scoring aren't available.
            Both would change settings shared by every domain on our mail servers, which isn't safe to expose per
            domain.
          </p>
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

  protected readonly rows = computed<Row[] | null>(() => {
    const overview = this.overview();
    if (!overview) return null;
    const base = '/domains/' + this.ctx.id() + '/spam/';
    const toggle = (on: boolean) => ({ label: on ? 'Enabled' : 'Disabled', class: badgeClass(on ? 'ok' : 'neutral') });
    return [
      { label: 'Subject rewriting', hint: 'Prefix the subject of junk with "SPAM"', link: base + 'subject', badge: toggle(overview.subjectRewrite) },
      { label: 'Junk if subject contains "SPAM"', hint: 'Case insensitive', link: base + 'subject', badge: toggle(overview.junkIfSubjectSpam) },
      { label: 'Sender denylist', hint: 'Senders whose mail is dropped', link: base + 'sender-lists', count: overview.senderDenylistCount },
      { label: 'Sender junklist', hint: 'Senders whose mail goes to Junk', link: base + 'sender-lists', count: overview.senderJunklistCount },
      { label: 'Recipient denylist', hint: 'Addresses on this domain that never receive mail', link: base + 'recipient-denylist', count: overview.recipientDenylistCount },
    ];
  });
}
