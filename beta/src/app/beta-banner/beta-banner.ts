import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';
import { legacyUrl } from '../config';

export const GITHUB_URL = 'https://github.com/ordnary-com/amelu';

const DISMISSED_KEY = 'amelu.beta-banner.dismissed';

/**
 * The card under the greeting on the dashboard reminding people this app is
 * still in beta, with the changelog, the GitHub repo and the way back to the
 * current dashboard. Closing it is remembered per browser.
 */
@Component({
  selector: 'amelu-beta-banner',
  imports: [RouterLink, Icon],
  template: `
    @if (!dismissed()) {
      <div class="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-[13px]" role="note">
        <amelu-icon name="circleAlert" [size]="18" [strokeWidth]="2.25" class="mt-px flex-none text-accent" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold">
            <span class="mr-1.5 rounded-full bg-accent px-1.5 py-px text-[10px] font-bold tracking-wide text-white uppercase">Beta</span>
            You're using the new Amelu dashboard, which is still being built.
          </p>
          <p class="mt-0.5 leading-relaxed text-muted">
            See <a routerLink="/changelog" class="font-medium text-link hover:underline">what changed</a>,
            follow along or report a problem on
            <a [href]="github" target="_blank" rel="noreferrer" class="font-medium text-link hover:underline">GitHub</a>,
            or switch back to the
            <a [href]="legacy" class="font-medium text-link hover:underline">current dashboard</a>
            any time.
          </p>
        </div>
        <button
          type="button"
          class="-mr-1.5 -mt-1 flex-none cursor-pointer rounded p-1 text-muted hover:bg-bg hover:text-ink"
          aria-label="Hide this notice"
          (click)="dismiss()"
        >
          <amelu-icon name="close" [size]="15" [strokeWidth]="2.5" />
        </button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BetaBanner {
  protected readonly github = GITHUB_URL;
  protected readonly legacy = legacyUrl('/');
  protected readonly dismissed = signal(read());

  protected dismiss(): void {
    this.dismissed.set(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private mode or blocked storage: the banner just comes back next load.
    }
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}
