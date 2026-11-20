import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, IconName } from '../icon';
import { UI } from '../ui';

const TIPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'globe', title: 'Name the domain and address', text: 'Which domain it is about, and the mailbox or address involved.' },
  { icon: 'clock', title: 'Say when it happened', text: 'Roughly is fine. A time helps us find it in the logs.' },
  { icon: 'doc', title: 'Paste the full error', text: 'The bounce or error message, as complete as you have it.' },
];

/** What to put in a ticket so it can be answered in one go, beside the Support pages. */
@Component({
  selector: 'amelu-support-tips',
  imports: [Icon, RouterLink],
  template: `
    <section [class]="ui.setCard">
      <div [class]="ui.setHeader"><h2 [class]="ui.setTitle">Get a Faster Answer</h2></div>
      <!-- Plain rows split by lines, like the lists elsewhere. -->
      <ul class="divide-y divide-line">
        @for (tip of tips; track tip.title) {
          <li class="flex items-start gap-3 px-5 py-3">
            <amelu-icon [name]="tip.icon" [size]="17" class="mt-0.5 flex-none text-ink" />
            <span class="min-w-0">
              <span class="block text-[14px] font-medium">{{ tip.title }}</span>
              <span class="mt-0.5 block text-[13px] leading-snug text-muted">{{ tip.text }}</span>
            </span>
          </li>
        }
      </ul>
      @if (showStatus()) {
        <p [class]="ui.setNote + ' border-t border-line text-[13px]'">
          <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
          <span>Something down for everyone? Check <a routerLink="/status" class="text-link hover:underline">Service status</a> first.</span>
        </p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SupportTips {
  protected readonly ui = UI;
  protected readonly tips = TIPS;
  /** Off where a Service status card is already next to it. */
  readonly showStatus = input(true);
}
