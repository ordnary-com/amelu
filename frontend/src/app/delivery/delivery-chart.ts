import { ChangeDetectionStrategy, Component, computed, inject, input, isDevMode, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Api, SendingDay, SendingHistory } from '../api';
import { UI } from '../ui';
import { reasonHint } from './reasons';

type Key = 'delivered' | 'deferred' | 'rejected';

// Each outcome as a soft bar with a solid label on it, like a usage meter.
const SERIES: { key: Key; label: string; dot: string; bar: string; pill: string }[] = [
  { key: 'delivered', label: 'Delivered', dot: 'bg-ok', bar: 'bg-ok/20', pill: 'bg-ok text-white' },
  { key: 'deferred', label: 'Deferred', dot: 'bg-warn', bar: 'bg-warn/25', pill: 'bg-warn text-white' },
  { key: 'rejected', label: 'Rejected', dot: 'bg-bad', bar: 'bg-bad/20', pill: 'bg-bad text-white' },
];

const TICKS = [0, 25, 50, 75, 100];

// A line under the numbers in the tooltip, on what the outcome means.
const NOTES: Record<Key, string> = {
  delivered: 'Accepted by the receiving mail server.',
  deferred: 'Temporarily refused. Amelu keeps retrying automatically.',
  rejected: 'Refused for good. The sender got a bounce message.',
};

/**
 * A domain's delivery over the last 14 days: totals in boxes, then the share
 * of recipients delivered, deferred and rejected as horizontal meters for the
 * last 14 and the last 7 days, and the reasons receivers gave for rejecting.
 */
@Component({
  selector: 'amelu-delivery-chart',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section [class]="ui.panel">
      <div [class]="ui.panelHeader">
        <h2 [class]="ui.panelTitle">Delivery <span class="font-normal text-muted">(last 14 days)</span></h2>
        @if (sample()) {
          <span class="rounded bg-warn/15 px-2 py-0.5 text-[11px] font-medium tracking-wide text-warn uppercase" title="This domain sent nothing in the last 14 days; the dev build shows made-up numbers instead.">Sample data</span>
        }
      </div>

      @if (history() === null) {
        <p class="p-4 text-[13px] text-muted">The delivery history couldn't be loaded.</p>
      } @else if (summary(); as s) {
        <!-- Totals: a large number with its label beside it. -->
        <div class="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          @for (box of boxes(); track box.label) {
            <div class="flex items-center gap-3 rounded border border-line bg-surface px-4 py-3">
              <span class="text-[28px] leading-none font-normal tabular-nums" [class]="box.tone">{{ box.value | number }}</span>
              <span class="min-w-0 leading-tight">
                <span class="block text-[14px]">{{ box.label }}</span>
                <span class="block truncate text-[12px] text-muted">{{ box.sub }}</span>
              </span>
            </div>
          }
        </div>

        @if (s.recipients === 0) {
          <p class="mx-4 mb-4 rounded-md bg-well px-3 py-6 text-center text-[13px] text-muted">Nothing sent from this domain in the last 14 days.</p>
        } @else {
          <div class="border-t border-line px-4 pt-5 pb-4">
            <div class="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <span></span>
              <div class="relative h-4 text-[12px] text-muted" aria-hidden="true">
                @for (t of ticks; track t) {
                  <span class="absolute -translate-x-1/2 tabular-nums" [style.left.%]="t">{{ t }}%</span>
                }
              </div>

              @for (row of periods(); track row.label) {
                <span class="text-[13px]">{{ row.label }}</span>
                <!-- One meter: the outcomes side by side, on a grid at every 25%. -->
                <div class="relative h-8" role="img" [attr.aria-label]="row.aria" (mouseleave)="hover.set(null)">
                  @for (t of ticks; track t) {
                    <span class="absolute inset-y-0 border-l border-dashed border-line" [style.left.%]="t" aria-hidden="true"></span>
                  }
                  <div class="relative flex h-full overflow-hidden rounded-sm">
                    @for (seg of row.segments; track seg.key) {
                      @if (seg.pct > 0) {
                        <div
                          class="relative flex h-full cursor-default items-center justify-center transition-[filter] hover:brightness-95"
                          [class]="seg.bar"
                          [style.width.%]="seg.pct"
                          (mouseenter)="hover.set({ row: row.label, key: seg.key })"
                        >
                          @if (seg.pct >= 12) {
                            <span class="rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums" [class]="seg.pill">{{ seg.count }} / {{ seg.pctLabel }}%</span>
                          }
                        </div>
                      }
                    }
                  </div>
                  <!-- The hovered part's numbers, centred above it. -->
                  @if (tip(); as t) {
                    @if (t.row === row.label) {
                      <div
                        class="pointer-events-none absolute bottom-full z-10 mb-2 w-52 -translate-x-1/2 rounded-md border border-line bg-popover p-2.5 text-[12px] shadow-lg"
                        [style.left.%]="t.center"
                      >
                        <p class="text-muted">{{ t.row }}</p>
                        <p class="mt-1 flex items-center justify-between gap-3">
                          <span class="flex items-center gap-1.5 font-medium"><span class="size-2 rounded-full" [class]="t.dot"></span>{{ t.label }}</span>
                          <span class="font-semibold tabular-nums">{{ t.count | number }}</span>
                        </p>
                        <p class="mt-0.5 flex justify-between gap-3 text-muted">
                          <span>Share of recipients</span>
                          <span class="tabular-nums">{{ t.pctLabel }}%</span>
                        </p>
                        <p class="mt-0.5 flex justify-between gap-3 text-muted">
                          <span>All recipients</span>
                          <span class="tabular-nums">{{ t.recipients | number }}</span>
                        </p>
                        @if (t.note) {
                          <p class="mt-1.5 border-t border-line pt-1.5 leading-snug text-muted">{{ t.note }}</p>
                        }
                      </div>
                    }
                  }
                </div>
              }

              <span></span>
              <div class="relative h-4 text-[12px] text-muted" aria-hidden="true">
                @for (t of ticks; track t) {
                  <span class="absolute -translate-x-1/2 tabular-nums" [style.left.%]="t">{{ t }}%</span>
                }
              </div>
            </div>

            <ul class="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-muted" aria-label="Legend">
              @for (s of series; track s.key) {
                <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full" [class]="s.dot"></span>{{ s.label }}</li>
              }
            </ul>
          </div>
        }

        @if (reasons().length) {
          <div class="border-t border-line bg-well px-4 py-4">
            <h3 class="text-[13px] font-medium">Why mail was rejected, last 7 days</h3>
            <ul class="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              @for (r of reasons(); track r.text) {
                <li class="flex gap-3 px-4 py-2.5 text-[13px]">
                  <span class="w-8 flex-none text-right font-semibold tabular-nums text-bad">{{ r.count }}</span>
                  <span class="min-w-0">
                    @if (r.hint) {
                      <span class="block">{{ r.hint }}</span>
                    }
                    <span class="block truncate font-mono text-[11px] text-muted" [title]="r.text">{{ r.text }}</span>
                  </span>
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <div class="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="h-[58px] animate-pulse rounded border border-line bg-bg"></div>
          }
        </div>
      }
    </section>
  `,
})
export class DeliveryChart {
  private readonly api = inject(Api);
  readonly domainId = input.required<string>();
  protected readonly ui = UI;
  protected readonly series = SERIES;
  protected readonly ticks = TICKS;

  // undefined while loading, null when the request failed
  private readonly loaded = toSignal(
    toObservable(this.domainId).pipe(
      switchMap((id) =>
        this.api.domainSendingHistory(id).pipe(
          map((h): SendingHistory | null => h),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );

  /** In the dev build, a domain that sent nothing shows sample numbers, so the layout can be judged. */
  protected readonly sample = computed(() => {
    const h = this.loaded();
    return isDevMode() && !!h && h.days.every((d) => !d.sent && !d.delivered && !d.deferred && !d.rejected);
  });
  protected readonly history = computed(() => (this.sample() ? SAMPLE : this.loaded()));

  protected readonly summary = computed(() => {
    const days = this.history()?.days;
    return days ? totals(days) : undefined;
  });

  protected readonly boxes = computed(() => {
    const s = this.summary();
    if (!s) return [];
    const share = (n: number) => (s.recipients ? `${pct(n, s.recipients)}% of recipients` : 'No recipients yet');
    return [
      { label: 'Messages sent', sub: `To ${s.recipients.toLocaleString('en-GB')} recipients`, value: s.sent, tone: '' },
      { label: 'Delivered', sub: share(s.delivered), value: s.delivered, tone: '' },
      { label: 'Deferred', sub: s.deferred ? 'Retried automatically' : share(s.deferred), value: s.deferred, tone: s.deferred ? 'text-warn' : '' },
      { label: 'Rejected', sub: share(s.rejected), value: s.rejected, tone: s.rejected ? 'text-bad' : '' },
    ];
  });

  protected readonly periods = computed(() => {
    const days = this.history()?.days;
    if (!days) return [];
    return [
      { label: 'Last 14 days', days },
      { label: 'Last 7 days', days: days.slice(-7) },
    ].map(({ label, days }) => {
      const t = totals(days);
      const segments = SERIES.map((s) => ({ ...s, count: t[s.key], pct: t.recipients ? (t[s.key] / t.recipients) * 100 : 0, pctLabel: pct(t[s.key], t.recipients) }));
      return { label, recipients: t.recipients, segments, aria: `${label}: ` + segments.map((seg) => `${seg.pctLabel}% ${seg.label.toLowerCase()}`).join(', ') };
    });
  });

  protected readonly hover = signal<{ row: string; key: Key } | null>(null);

  /** The hovered part, with where its middle sits along the meter. */
  protected readonly tip = computed(() => {
    const h = this.hover();
    const row = h && this.periods().find((p) => p.label === h.row);
    if (!h || !row) return null;
    let start = 0;
    for (const seg of row.segments) {
      if (seg.key === h.key) {
        // Kept inside the meter, so a tip on a sliver at either end doesn't hang off it.
        const center = Math.min(88, Math.max(12, start + seg.pct / 2));
        return { row: row.label, recipients: row.recipients, center, ...seg, note: NOTES[seg.key] };
      }
      start += seg.pct;
    }
    return null;
  });

  protected readonly reasons = computed(() => (this.history()?.reasons ?? []).map((r) => ({ ...r, hint: reasonHint(r.text) })));
}

function totals(days: SendingDay[]) {
  const sum = (k: keyof Omit<SendingDay, 'day'>) => days.reduce((n, d) => n + d[k], 0);
  const delivered = sum('delivered');
  const deferred = sum('deferred');
  const rejected = sum('rejected');
  return { sent: sum('sent'), delivered, deferred, rejected, recipients: delivered + deferred + rejected };
}

// One decimal below 10%, whole numbers above, like "0.8" and "91".
function pct(n: number, of: number): string {
  if (!of) return '0';
  const p = (n / of) * 100;
  return p > 0 && p < 10 ? p.toFixed(1) : Math.round(p).toString();
}

// Made-up history for the dev build: 14 days ending today, mostly delivered,
// a few deferrals and some rejections, with two rejection reasons.
const SAMPLE: SendingHistory = (() => {
  const delivered = [12, 18, 9, 22, 31, 4, 2, 27, 35, 19, 24, 41, 6, 15];
  const deferred = [0, 1, 0, 2, 3, 0, 0, 1, 4, 0, 2, 3, 0, 1];
  const rejected = [1, 0, 0, 1, 2, 0, 0, 3, 1, 0, 1, 2, 0, 1];
  const today = new Date();
  const days: SendingDay[] = delivered.map((n, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (delivered.length - 1 - i));
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { day, sent: Math.round((n + deferred[i] + rejected[i]) * 0.8), delivered: n, deferred: deferred[i], rejected: rejected[i] };
  });
  return {
    days,
    reasons: [
      { text: "550 5.1.1 The email account that you tried to reach does not exist.", count: 4 },
      { text: '550 5.7.1 Service unavailable, Client host blocked using Spamhaus.', count: 2 },
    ],
    senders: {},
  };
})();
