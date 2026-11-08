import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';
import { DitherShader } from '../login/dither-shader';
import { activePromo } from '../promo';

/**
 * The campaign deal of the day as one line, with its codes to copy. Renders
 * nothing outside the campaign. It can't be dismissed: the deal stays up until it ends.
 */
@Component({
  selector: 'amelu-promo-banner',
  imports: [DatePipe, NgTemplateOutlet, RouterLink, Icon, DitherShader],
  template: `
    @if (promo && variant() === 'sidebar') {
      <!-- Part of the menu: a dither in the menu's own ink, rising from the bottom and fading
           into the sidebar, with the deal on top of it. -->
      <div class="relative overflow-hidden rounded-lg px-3 pt-10 pb-3 text-[12px] leading-snug text-chrome-ink" role="note" [attr.aria-label]="promo.name + ' deal'">
        <div class="pointer-events-none absolute inset-0 opacity-25 [mask-image:linear-gradient(to_top,black,rgba(0,0,0,0.5)_45%,transparent)]" aria-hidden="true">
          <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--chrome-ink)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
        </div>
        <div class="relative">
          <p class="text-[13px] font-semibold">{{ promo.name }}</p>
          <p class="mt-0.5 text-chrome-ink/75">{{ capital(promo.yearly.deal) }} on Go or Pro, until {{ promo.lastDay | date: 'd MMM' }}.</p>
          <div class="mt-2.5">
            <button
              type="button"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded bg-chrome-ink/15 px-2 py-1 font-mono text-[12px] font-bold tracking-wide backdrop-blur-sm hover:bg-chrome-ink/25"
              [attr.aria-label]="'Copy ' + promo.yearly.code"
              (click)="copy(promo.yearly.code)"
            >
              {{ promo.yearly.code }}
              <amelu-icon [name]="copied() === promo.yearly.code ? 'check' : 'copy'" [size]="11" />
            </button>
          </div>
          <a routerLink="/billing/plans" class="mt-2 inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
            See plans <amelu-icon name="arrowRight" [size]="12" />
          </a>
        </div>
      </div>
    } @else if (promo) {
      <div class="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3" role="note" [attr.aria-label]="promo.name + ' deal'">
        <amelu-icon name="star" [size]="18" class="mt-0.5 flex-none text-link" />
        <div class="min-w-0 flex-1 text-[13px] leading-relaxed">
          <span class="font-semibold">{{ promo.name }}</span>
          <span class="text-muted"> until {{ promo.lastDay | date: 'd MMMM' }}.</span>
          {{ capital(promo.yearly.deal) }} on Go or Pro with
          <ng-container *ngTemplateOutlet="code; context: { $implicit: promo.yearly.code }" />,
          or {{ promo.monthly.deal }} paying monthly with
          <ng-container *ngTemplateOutlet="code; context: { $implicit: promo.monthly.code }" />.
          @if (showLink()) {
            <a routerLink="/billing/plans" class="ml-1 font-medium whitespace-nowrap text-link hover:underline">See plans</a>
          }
        </div>
      </div>
    }

    <ng-template #code let-value>
      <button
        type="button"
        class="inline-flex cursor-pointer items-center gap-1 rounded bg-bg px-1.5 py-px align-baseline font-mono text-[12px] font-bold tracking-wide hover:bg-accent/10"
        [attr.aria-label]="'Copy ' + value"
        [title]="copied() === value ? 'Copied' : 'Copy'"
        (click)="copy(value)"
      >
        {{ value }}
        <amelu-icon [name]="copied() === value ? 'check' : 'copy'" [size]="11" class="text-muted" />
      </button>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
})
export class PromoBanner {
  /** Off on the plans page itself. */
  readonly showLink = input(true);
  /** "sidebar": a small card on the menu's colours, at the bottom of the main menu. */
  readonly variant = input<'inline' | 'sidebar'>('inline');
  protected readonly promo = activePromo();
  protected readonly copied = signal<string | null>(null);

  protected capital(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  protected async copy(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
    this.copied.set(code);
    setTimeout(() => this.copied.set(null), 1500);
  }
}
