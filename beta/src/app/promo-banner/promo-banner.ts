import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';
import { activePromo } from '../promo';

/** The campaign deal of the day, with its codes to copy; renders nothing outside the campaign. */
@Component({
  selector: 'amelu-promo-banner',
  imports: [DatePipe, RouterLink, Icon],
  template: `
    @if (promo; as p) {
      <section class="rounded-lg border border-accent/40 bg-accent/5 p-4" [attr.aria-label]="p.name + ' deal'">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[12px] font-bold tracking-wide text-link uppercase">{{ p.name }} · until {{ p.lastDay | date: 'd MMMM' }}</p>
            <p class="mt-1 text-[14px] font-semibold">Upgrade to Go or Pro with a code at checkout</p>
          </div>
          @if (showLink()) {
            <a routerLink="/billing/plans" class="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent/80">
              See plans <amelu-icon name="arrowRight" [size]="14" />
            </a>
          }
        </div>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          @for (deal of [{ label: 'Paying yearly', d: p.yearly }, { label: 'Paying monthly', d: p.monthly }]; track deal.label) {
            <div class="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2">
              <div class="min-w-0 flex-1">
                <div class="text-[11px] text-muted">{{ deal.label }}: {{ deal.d.deal }}</div>
                <div class="font-mono text-[14px] font-bold tracking-wide">{{ deal.d.code }}</div>
              </div>
              <button
                type="button"
                class="flex size-8 flex-none cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink"
                [attr.aria-label]="'Copy ' + deal.d.code"
                (click)="copy(deal.d.code)"
              >
                <amelu-icon [name]="copied() === deal.d.code ? 'check' : 'copy'" [size]="14" />
              </button>
            </div>
          }
        </div>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
})
export class PromoBanner {
  /** Off on the plans page itself. */
  readonly showLink = input(true);
  protected readonly promo = activePromo();
  protected readonly copied = signal<string | null>(null);

  protected async copy(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
    this.copied.set(code);
    setTimeout(() => this.copied.set(null), 1500);
  }
}
