import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

/**
 * Someone's Ordnary picture, or their initials when there is none (or it fails
 * to load). With `gravatar`, a missing picture is looked up on Gravatar by the
 * email's SHA-256 first.
 */
@Component({
  selector: 'amelu-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex flex-none overflow-hidden rounded-full' },
  template: `
    @if (picture() && !failed()) {
      <img
        [src]="picture()"
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
  /** Fall back to Gravatar when there is no Ordnary picture. */
  readonly gravatar = input(false);

  protected readonly failed = signal(false);
  private readonly gravatarUrl = signal<string | null>(null);
  protected readonly picture = computed(() => this.src() || this.gravatarUrl());

  constructor() {
    effect(() => {
      const email = this.email()?.trim().toLowerCase();
      this.gravatarUrl.set(null);
      this.failed.set(false);
      if (!this.gravatar() || this.src() || !email || !globalThis.crypto?.subtle) return;
      const size = this.size() * 2;
      void crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)).then((digest) => {
        const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
        // d=404: no Gravatar means a failed load, and the initials show instead.
        this.gravatarUrl.set(`https://gravatar.com/avatar/${hash}?s=${size}&d=404`);
      });
    });
  }
  protected readonly fontSize = computed(() => Math.max(8, Math.round(this.size() * 0.38)));
  protected readonly initials = computed(() => {
    const source = (this.name() || this.email() || '').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  });
}
