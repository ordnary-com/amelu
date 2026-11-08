import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface SectionTab {
  label: string;
  /** Relative to the section's base, '' for its first page. */
  path: string;
}

/**
 * Tabs between the pages of one section (DNS, Spam filtering), in place of a
 * third sidebar column that left the content too narrow. Same look as My
 * Account's tabs.
 */
@Component({
  selector: 'amelu-section-tabs',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="flex gap-5 overflow-x-auto text-[13px] shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none]" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab.path) {
        <a
          [routerLink]="base() + tab.path"
          routerLinkActive="border-accent! font-semibold text-ink!"
          [routerLinkActiveOptions]="{ exact: true }"
          class="border-b-2 border-transparent pb-2.5 whitespace-nowrap text-muted hover:text-ink"
        >
          {{ tab.label }}
        </a>
      }
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mb-6 block' },
})
export class SectionTabs {
  readonly base = input.required<string>();
  readonly tabs = input.required<SectionTab[]>();
  readonly label = input('Sections');
}

export const DNS_TABS: SectionTab[] = [
  { label: 'Overview', path: '/dns' },
  { label: 'Records', path: '/dns/records' },
  { label: 'DNS zone', path: '/dns/zone' },
];

export const SPAM_TABS: SectionTab[] = [
  { label: 'Overview', path: '/spam' },
  { label: 'Aggressiveness', path: '/spam/subject' },
  { label: 'Sender lists', path: '/spam/sender-lists' },
  { label: 'Recipient denylist', path: '/spam/recipient-denylist' },
];
