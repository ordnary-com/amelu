import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The page's own title under the shared mailbox header. Description goes in as content. */
@Component({
  selector: 'amelu-mailbox-heading',
  template: `
    <h2 class="text-[16px] font-bold">{{ title() }}</h2>
    <div class="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted empty:hidden"><ng-content /></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mb-5 block' },
})
export class MailboxHeading {
  readonly title = input.required<string>();
}
