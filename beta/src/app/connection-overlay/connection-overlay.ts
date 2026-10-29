import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Session } from '../session';
import { UI } from '../ui';

/**
 * Over the loading screen when the session check runs long or the API can't
 * be reached. Mail itself runs on separate servers, so it says that too.
 */
@Component({
  selector: 'amelu-connection-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.connection() !== 'ok') {
      <div class="app-loading" role="progressbar" aria-label="Connecting to Amelu"></div>
      <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-labelledby="connection-title"
          aria-describedby="connection-text"
          class="w-full max-w-[440px] rounded-lg border border-line bg-surface p-8 shadow-xl"
        >
          <img src="/amelu-logo.png" alt="Amelu" class="h-6 dark:brightness-0 dark:invert" />

          <h1 id="connection-title" class="mt-6 text-[18px] font-bold">
            {{ unreachable() ? 'Amelu is currently unreachable' : 'Amelu is taking longer than usual' }}
          </h1>
          <p id="connection-text" class="mt-2 text-[14px] leading-[22px] text-muted">
            @if (unreachable()) {
              We can't reach the Amelu servers right now. This is usually a temporary disruption or planned
              maintenance. We keep trying in the background and continue as soon as we're back.
            } @else {
              We're still connecting. This can take a few seconds when Amelu hasn't been used for a while.
            }
          </p>

          @if (unreachable()) {
            <p class="mt-4 rounded-md bg-bg px-4 py-3 text-[13px] leading-[20px]">
              Your email keeps working. Mail apps and webmail are not affected.
            </p>
            <div class="mt-6 flex flex-wrap gap-2">
              <button type="button" [class]="ui.primary" (click)="session.retry()">Try again</button>
              <a [class]="ui.outline" href="https://ordnary.com/status" target="_blank" rel="noopener noreferrer">
                Status page
              </a>
              <a [class]="ui.outline" href="https://webmail.amelu.org">Open webmail</a>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ConnectionOverlay {
  protected readonly session = inject(Session);
  protected readonly ui = UI;
  protected readonly unreachable = computed(() => this.session.connection() === 'unreachable');
}
