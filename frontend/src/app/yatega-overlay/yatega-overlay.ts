import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Session } from '../session';
import { Icon } from '../icon';
import { UI } from '../ui';

export const YATEGA_URL = 'https://console.yatega.com';

/**
 * Amelu continues as Yatega: shown to every signed-in customer, over the
 * dashboard, every time, and it cannot be closed. The only way on is the new
 * address; the Amelu dashboard behind it is no longer meant to be used.
 */
@Component({
  selector: 'amelu-yatega-overlay',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <div class="fixed inset-0 z-[55] flex items-center justify-center bg-[#061040]/55 p-4 backdrop-blur-[3px]">
        <article
          role="dialog"
          aria-modal="true"
          aria-labelledby="yatega-title"
          class="w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_80px_rgba(6,16,64,0.4)]"
        >
          <!-- Top banner in the sidebar's navy: the two marks and the line, all white. The marks sit on the
               text's baseline at the text's x-height (about 14px at 26px): measured from the files, amelu's
               x-height is 0.65 of its height and ends on the baseline; yatega's is 0.58 of its height with
               y and g 0.25 below it, hence 24px tall and shifted down by that descender. -->
          <div class="relative bg-[#001c59] px-10 pt-9 pb-8 text-white max-sm:px-6">
            <h1 id="yatega-title" class="flex flex-wrap items-baseline gap-x-3 gap-y-2 text-[26px] leading-none font-bold tracking-[-0.01em]">
              <img src="/amelu-logo.png" alt="Amelu" class="block h-[22px] w-auto brightness-0 invert" />
              <span>is becoming</span>
              <img src="/yatega-wordmark.png" alt="Yatega" class="block h-[24px] w-auto translate-y-[6px]" />
            </h1>
          </div>

          <div class="px-10 pt-7 pb-9 max-sm:px-6">
            <div class="space-y-4 text-[15px] leading-[25px] text-ink-soft">
              <p>
                Amelu started as email hosting on your own domain. It has since become the first part of Ordnary
                Workspace, the European alternative to Microsoft 365 and Google Workspace that we are building, and
                with that it gets a new name: Yatega.
              </p>
              <p>
                Nothing about your account changes. Your domains, mailboxes and settings are already there, on the
                same servers in the EU, run by the same people. Your mail keeps working exactly as it does today; mail
                apps, webmail and DNS records stay as they are.
              </p>
              <p>
                From today the dashboard lives at
                <a [href]="yategaUrl" class="font-medium text-link hover:underline">console.yatega.com</a>. Sign in
                there with your Ordnary account, as you do here. This address keeps working for a while and will then
                send you on.
              </p>
              <p class="text-muted">Thank you for being with us from the start.</p>
            </div>
            <div class="mt-8">
              <a [class]="ui.primary + ' h-10 px-5 text-[14px]'" [href]="yategaUrl">Continue to Yatega</a>
            </div>
          </div>
        </article>
      </div>
    }
  `,
})
export class YategaOverlay {
  private readonly session = inject(Session);
  protected readonly ui = UI;
  protected readonly yategaUrl = YATEGA_URL;

  /** For every signed-in customer, every time: the dashboard here is closed for work. */
  protected readonly show = computed(() => this.session.customer() !== null);
}
