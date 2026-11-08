import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Api, SendingDay, SendingHistory } from '../api';
import { reasonHint } from './reasons';

const SERIES = [
  { key: 'delivered', label: 'Delivered', fill: 'var(--ok)' },
  { key: 'deferred', label: 'Deferred', fill: 'var(--warn)' },
  { key: 'rejected', label: 'Rejected', fill: 'var(--bad)' },
] as const;

// Chart geometry in viewBox units; the svg scales to its container.
const W = 700;
const H = 160;
const GAP = 6;

/**
 * A domain's last 14 days: what happened to the recipients it sent to, as
 * stacked bars, with the reasons receivers gave for rejecting mail.
 */
@Component({
  selector: 'amelu-delivery-chart',
  imports: [DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-lg border border-line bg-surface p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 class="text-[14px] font-bold">Delivery, last 14 days</h2>
          <p class="mt-0.5 text-[12px] text-muted">What happened to the recipients of mail sent from this domain.</p>
        </div>
        @if (totals(); as t) {
          <ul class="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" aria-label="Legend">
            @for (s of series; track s.key) {
              <li class="flex items-center gap-1.5">
                <span class="size-2.5 rounded-sm" [style.background]="s.fill"></span>
                <span class="text-muted">{{ s.label }}</span>
                <span class="font-semibold tabular-nums">{{ t[s.key] | number }}</span>
              </li>
            }
          </ul>
        }
      </div>

      @if (history() === null) {
        <p class="mt-4 text-[13px] text-muted">The delivery history couldn't be loaded.</p>
      } @else if (bars(); as list) {
        @if (empty()) {
          <p class="mt-4 rounded-md bg-bg px-3 py-6 text-center text-[13px] text-muted">Nothing sent from this domain in the last 14 days.</p>
        } @else {
          <div class="relative mt-4" (mouseleave)="hover.set(null)">
            <svg [attr.viewBox]="'0 0 ' + w + ' ' + (h + 18)" class="h-auto w-full overflow-visible" role="img" [attr.aria-label]="'Delivery per day, ' + (totals()?.delivered ?? 0) + ' delivered in total'">
              <line [attr.x1]="0" [attr.x2]="w" [attr.y1]="h" [attr.y2]="h" stroke="var(--line)" />
              @for (bar of list; track bar.day.day; let i = $index) {
                <g>
                  @for (seg of bar.segments; track seg.key) {
                    <rect [attr.x]="bar.x" [attr.y]="seg.y" [attr.width]="bar.width" [attr.height]="seg.height" [attr.fill]="seg.fill" [attr.rx]="seg.top ? 3 : 0" />
                  }
                  <!-- Wider than the bar, so hovering is easy. -->
                  <rect [attr.x]="bar.x - gap / 2" y="0" [attr.width]="bar.width + gap" [attr.height]="h" fill="transparent" (mouseenter)="hover.set(i)" />
                  @if (i % 2 === 1 || list.length < 8) {
                    <text [attr.x]="bar.x + bar.width / 2" [attr.y]="h + 14" text-anchor="middle" class="fill-muted text-[10px]">{{ bar.day.day | date: 'd MMM' }}</text>
                  }
                </g>
              }
            </svg>
            @if (hovered(); as hb) {
              <div
                class="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-md border border-line bg-popover p-2.5 text-[12px] shadow-lg"
                [style.left.%]="((hb.x + hb.width / 2) / w) * 100"
              >
                <p class="font-semibold">{{ hb.day.day | date: 'EEEE d MMMM' }}</p>
                <p class="mt-1 text-muted">{{ hb.day.sent | number }} messages sent</p>
                @for (s of series; track s.key) {
                  <p class="flex items-center justify-between gap-2">
                    <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm" [style.background]="s.fill"></span>{{ s.label }}</span>
                    <span class="font-semibold tabular-nums">{{ hb.day[s.key] | number }}</span>
                  </p>
                }
              </div>
            }
          </div>
          <table class="sr-only">
            <caption>Delivery per day</caption>
            <thead><tr><th>Day</th><th>Sent</th>@for (s of series; track s.key) {<th>{{ s.label }}</th>}</tr></thead>
            <tbody>
              @for (bar of list; track bar.day.day) {
                <tr><td>{{ bar.day.day }}</td><td>{{ bar.day.sent }}</td>@for (s of series; track s.key) {<td>{{ bar.day[s.key] }}</td>}</tr>
              }
            </tbody>
          </table>
        }

        @if (reasons().length) {
          <div class="mt-5 border-t border-line pt-4">
            <h3 class="text-[13px] font-bold">Why mail was rejected, last 7 days</h3>
            <ul class="mt-2 space-y-2.5">
              @for (r of reasons(); track r.text) {
                <li class="flex gap-3 text-[13px]">
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
        <div class="mt-4 h-40 animate-pulse rounded-md bg-bg" aria-hidden="true"></div>
      }
    </section>
  `,
})
export class DeliveryChart {
  private readonly api = inject(Api);
  readonly domainId = input.required<string>();

  protected readonly series = SERIES;
  protected readonly w = W;
  protected readonly h = H;
  protected readonly gap = GAP;
  protected readonly hover = signal<number | null>(null);

  // undefined while loading, null when the request failed
  protected readonly history = toSignal(
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

  protected readonly totals = computed(() => {
    const days = this.history()?.days;
    if (!days) return null;
    const sum = (k: keyof SendingDay) => days.reduce((n, d) => n + (d[k] as number), 0);
    return { delivered: sum('delivered'), deferred: sum('deferred'), rejected: sum('rejected') };
  });

  protected readonly empty = computed(() => (this.history()?.days ?? []).every((d) => !d.sent && !d.delivered && !d.deferred && !d.rejected));

  protected readonly bars = computed(() => {
    const days = this.history()?.days;
    if (!days) return undefined;
    const max = Math.max(1, ...days.map((d) => d.delivered + d.deferred + d.rejected));
    const width = (W - GAP * (days.length - 1)) / days.length;
    return days.map((day, i) => {
      let y = H;
      const parts = SERIES.filter((s) => day[s.key] > 0);
      const segments = parts.map((s, j) => {
        const height = (day[s.key] / max) * (H - 4);
        y -= height;
        // A 2px gap below every segment that sits on another one.
        return { key: s.key, fill: s.fill, y, height: Math.max(0, height - (j > 0 ? 2 : 0)), top: j === parts.length - 1 };
      });
      return { day, x: i * (width + GAP), width, segments };
    });
  });

  protected readonly hovered = computed(() => {
    const i = this.hover();
    return i === null ? null : (this.bars()?.[i] ?? null);
  });

  protected readonly reasons = computed(() => (this.history()?.reasons ?? []).map((r) => ({ ...r, hint: reasonHint(r.text) })));
}
