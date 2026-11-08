import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Messages sent per day as a small line, with the total next to it. */
@Component({
  selector: 'amelu-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2' },
  template: `
    <svg viewBox="0 0 70 20" class="h-5 w-[70px] overflow-visible" aria-hidden="true">
      <polyline [attr.points]="points()" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
    <span class="w-14 text-right text-[11px] tabular-nums text-muted">{{ total() }} sent</span>
    <span class="sr-only">in the last {{ values().length }} days</span>
  `,
})
export class Sparkline {
  readonly values = input.required<number[]>();
  protected readonly total = computed(() => this.values().reduce((a, b) => a + b, 0));
  protected readonly points = computed(() => {
    const v = this.values();
    const max = Math.max(1, ...v);
    const step = v.length > 1 ? 70 / (v.length - 1) : 0;
    return v.map((n, i) => `${(i * step).toFixed(1)},${(19 - (n / max) * 18).toFixed(1)}`).join(' ');
  });
}
