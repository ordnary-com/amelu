import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
  imports: [DatePipe, RouterLink, Icon, DitherShader],
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
      <!-- A dithered card like the Overview banner: the deal large on the left, both codes
           on the right with what each one is for. -->
      <section
        class="relative flex flex-col gap-4 overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative md:flex-row md:items-center"
        role="note"
        [attr.aria-label]="promo.name + ' deal'"
      >
        <div class="pointer-events-none !absolute inset-0 opacity-35 [mask-image:linear-gradient(to_left,black,rgba(0,0,0,0.5)_35%,transparent_75%)]" aria-hidden="true">
          <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span class="rounded bg-accent/12 px-1.5 py-0.5 font-medium text-link">{{ promo.name }}</span>
            {{ daysLeft() }}
          </p>
          <p class="mt-2 text-[20px] leading-tight font-normal tracking-[-0.01em]">{{ capital(promo.yearly.deal) }} on Go or Pro</p>
          <p class="mt-1 text-[13px] text-muted">
            Use the code at checkout. Paying monthly? You get {{ promo.monthly.deal }} instead.
            @if (showLink()) {
              <a routerLink="/billing/plans" class="ml-1 font-medium whitespace-nowrap text-link hover:underline">See plans</a>
            }
          </p>
        </div>
        <div class="flex flex-none gap-2">
          @for (option of [{ label: 'Yearly', code: promo.yearly.code }, { label: 'Monthly', code: promo.monthly.code }]; track option.code) {
            <button
              type="button"
              class="flex min-w-32 cursor-pointer flex-col items-start rounded-md border border-line bg-surface px-3 py-2 text-left hover:border-accent/50"
              [attr.aria-label]="'Copy ' + option.code"
              (click)="copy(option.code)"
            >
              <span class="text-[11px] text-muted">{{ option.label }}</span>
              <span class="mt-0.5 flex w-full items-center justify-between gap-2 font-mono text-[13px] font-bold tracking-wide">
                {{ option.code }}
                <amelu-icon [name]="copied() === option.code ? 'check' : 'copy'" [size]="12" class="text-muted" />
              </span>
            </button>
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
  /** "sidebar": a small card on the menu's colours, at the bottom of the main menu. */
  readonly variant = input<'inline' | 'sidebar'>('inline');
  protected readonly promo = activePromo();
  protected readonly copied = signal<string | null>(null);

  /** "Last day today" or "Ends 26 November, 9 days left", in Amsterdam time like the phases. */
  protected daysLeft(): string {
    if (!this.promo) return '';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
    const days = Math.round((Date.parse(this.promo.lastDay) - Date.parse(today)) / 86_400_000);
    if (days <= 0) return 'Last day today';
    const end = new Date(this.promo.lastDay + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    return `Ends ${end}, ${days} day${days === 1 ? '' : 's'} left`;
  }

  protected capital(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  protected async copy(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
    this.copied.set(code);
    setTimeout(() => this.copied.set(null), 1500);
  }
}
