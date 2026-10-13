import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/** Someone's Ordnary picture, or their initials when there is none (or it fails to load). */
@Component({
  selector: 'amelu-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex flex-none overflow-hidden rounded-full' },
  template: `
    @if (src() && !failed()) {
      <img
        [src]="src()"
        alt=""
        class="size-full object-cover"
        referrerpolicy="no-referrer"
        (error)="failed.set(true)"
      />
    } @else {
      <span
        class="flex size-full items-center justify-center bg-accent-soft font-semibold text-link"
        [style.font-size.px]="fontSize()"
      >
        {{ initials() }}
      </span>
    }
  `,
})
export class Avatar {
  readonly src = input<string | undefined>();
  readonly name = input<string | undefined>();
  readonly email = input<string | undefined>();
  /** Diameter in px, used to size the initials. */
  readonly size = input(32);

  protected readonly failed = signal(false);
  protected readonly fontSize = computed(() => Math.max(8, Math.round(this.size() * 0.38)));
  protected readonly initials = computed(() => {
    const source = (this.name() || this.email() || '').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  });
}
