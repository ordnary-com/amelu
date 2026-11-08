import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';
import { activePromo } from '../promo';

/**
 * The campaign deal of the day as one line, with its codes to copy. Renders
 * nothing outside the campaign or once dismissed (remembered per deal).
 */
@Component({
  selector: 'amelu-promo-banner',
  imports: [DatePipe, NgTemplateOutlet, RouterLink, Icon],
  template: `
    @if (promo && !dismissed()) {
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
        <button type="button" class="-mr-1 flex-none cursor-pointer rounded p-1 text-muted hover:text-ink" aria-label="Dismiss" (click)="dismiss()">
          <amelu-icon name="close" [size]="15" />
        </button>
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
  protected readonly promo = activePromo();
  protected readonly copied = signal<string | null>(null);
  private readonly key = this.promo ? `amelu.promo.dismissed.${this.promo.yearly.code}` : '';
  protected readonly dismissed = signal(this.readDismissed());

  protected capital(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  protected dismiss(): void {
    this.dismissed.set(true);
    try {
      localStorage.setItem(this.key, '1');
    } catch {
      // Hidden for this visit only.
    }
  }

  private readDismissed(): boolean {
    try {
      return !!this.key && localStorage.getItem(this.key) === '1';
    } catch {
      return false;
    }
  }

  protected async copy(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
    this.copied.set(code);
    setTimeout(() => this.copied.set(null), 1500);
  }
}
