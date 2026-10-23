import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LoadErrors } from '../load-errors';

/** The undraw illustrations in public/illustrations, recolored to the --ill-* variables in styles.css. */
export type Illustration =
  | 'all-checked'
  | 'authentication'
  | 'confidential-letter'
  | 'domain-names'
  | 'empty-mailbox'
  | 'envelope'
  | 'file-search'
  | 'happy-news'
  | 'in-progress'
  | 'inbox-cleanup'
  | 'invoice'
  | 'message-sent'
  | 'no-data'
  | 'profile'
  | 'server-down';

// Inlined rather than an <img>, so the illustration follows the theme's colors. Fetched once per name.
const svgs = new Map<Illustration, Promise<string>>();

function loadSvg(name: Illustration): Promise<string> {
  let svg = svgs.get(name);
  if (!svg) {
    svg = fetch(`/illustrations/${name}.svg`).then((res) => (res.ok ? res.text() : ''));
    svg.catch(() => svgs.delete(name));
    svgs.set(name, svg);
  }
  return svg;
}

/**
 * What a list or card shows when there's nothing in it, or when it couldn't
 * load. The description goes in as content; buttons or links marked with an
 * `actions` attribute go underneath it.
 *
 * `compact` is left-aligned with less padding and no illustration, for the
 * narrow side cards. A failed load shows the server-down illustration.
 */
@Component({
  selector: 'amelu-empty-state',
  template: `
    <div [class]="compact() ? 'px-4 py-4' : 'flex flex-col items-center px-6 py-12 text-center'">
      @if (svg(); as art) {
        <div class="mb-5 h-[120px] w-[180px] [&>svg]:size-full" aria-hidden="true" [innerHTML]="art"></div>
      }
      <div [class]="compact() ? '' : 'max-w-sm'">
        <p class="text-[14px] font-semibold" [class.text-bad]="error()">{{ title() }}</p>
        <div class="mt-0.5 text-[13px] leading-relaxed text-muted">
          <ng-content />
          @if (error()) {
            Try again in a moment.
            @if (errors.last(); as message) {
              <p class="mt-1.5 font-mono text-[11px] break-words text-muted">{{ message }}</p>
            }
          }
        </div>
        <div class="flex flex-wrap gap-2 empty:hidden" [class]="compact() ? 'mt-2.5' : 'mt-4 justify-center'">
          <ng-content select="[actions]" />
          @if (error()) {
            <button
              type="button"
              class="inline-flex h-8 cursor-pointer items-center rounded-md border border-line px-3 text-[13px] font-medium text-ink hover:bg-bg"
              (click)="reload()"
            >
              Reload
            </button>
          }
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EmptyState {
  protected readonly errors = inject(LoadErrors);
  private readonly sanitizer = inject(DomSanitizer);
  readonly title = input.required<string>();
  readonly compact = input(false);
  /** The request failed: red title and a reload button. */
  readonly error = input(false);
  readonly illustration = input<Illustration | null>(null);

  private readonly art = computed<Illustration | null>(() =>
    this.compact() ? null : this.error() ? 'server-down' : this.illustration(),
  );
  protected readonly svg = signal<SafeHtml | null>(null);

  constructor() {
    effect((onCleanup) => {
      const name = this.art();
      this.svg.set(null);
      if (!name) return;
      let current = true;
      onCleanup(() => (current = false));
      // Our own static files, never user input.
      void loadSvg(name).then((text) => current && text && this.svg.set(this.sanitizer.bypassSecurityTrustHtml(text)));
    });
  }

  // None of these pages keep unsaved input next to a failed list, so a full reload is safe.
  protected reload() {
    location.reload();
  }
}
