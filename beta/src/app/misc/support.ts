import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { Icon, IconName } from '../icon';
import { DitherShader } from '../login/dither-shader';

const CONTACT_URL = 'https://ordnary.com/contact';

/** The current dashboard's /support. */
@Component({
  selector: 'amelu-support',
  imports: [PageHeader, RouterLink, NgTemplateOutlet, Icon, DitherShader],
  template: `
    <amelu-page-header title="Contact support">
      Get help with your Amelu account, domains, DNS, or mail delivery.
    </amelu-page-header>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="mail" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Contact us</h2>
          <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-muted">
            Reach us through the
            <a [href]="contactUrl" target="_blank" rel="noreferrer" class="text-link hover:underline">Ordnary contact page</a>.
            Include the affected domain, the approximate time of the problem, and any error message or bounce you
            received.
          </p>
          <a [href]="contactUrl" target="_blank" rel="noreferrer" class="mt-4 inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-[13px] font-medium hover:border-ink/20 hover:bg-bg">Go to contact page</a>
        </section>

        <section>
          <h2 [class]="ui.sectionTitle">What to include</h2>
          <ul [class]="ui.card + ' divide-y divide-line overflow-hidden'">
            @for (item of checklist; track item.title; let i = $index) {
              <li class="flex items-start gap-3 px-4 py-3">
                <span class="mt-px inline-flex size-6 flex-none items-center justify-center rounded-full bg-bg text-[12px] font-medium text-muted tabular-nums" aria-hidden="true">{{ i + 1 }}</span>
                <div class="min-w-0">
                  <div class="text-[14px] font-medium">{{ item.title }}</div>
                  <div class="mt-0.5 text-[12px] text-muted">{{ item.text }}</div>
                </div>
              </li>
            }
          </ul>
        </section>
      </div>

      <aside class="space-y-3">
        @for (option of options; track option.title) {
          @if (option.external) {
            <a [href]="option.link" target="_blank" rel="noreferrer" [class]="linkCard">
              <ng-container *ngTemplateOutlet="card; context: { $implicit: option }" />
            </a>
          } @else {
            <a [routerLink]="option.link" [class]="linkCard">
              <ng-container *ngTemplateOutlet="card; context: { $implicit: option }" />
            </a>
          }
        }
      </aside>
    </div>

    <ng-template #card let-option>
      <span class="flex size-8 flex-none items-center justify-center rounded-full bg-accent/10 text-accent" aria-hidden="true">
        <amelu-icon [name]="option.icon" [size]="15" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-[14px] font-bold">{{ option.title }}</span>
        <span class="mt-0.5 block text-[13px] leading-relaxed text-muted">{{ option.text }}</span>
        <span class="mt-2 block text-[13px] font-medium text-link">{{ option.action }}</span>
      </span>
      <amelu-icon
        [name]="option.external ? 'external' : 'chevronRight'"
        [size]="14"
        class="mt-1 flex-none text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
      />
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class Support {
  protected readonly ui = UI;
  protected readonly contactUrl = CONTACT_URL;
  protected readonly linkCard =
    'group flex items-start gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink/20 hover:bg-bg/40';
  protected readonly options: { icon: IconName; title: string; text: string; action: string; link: string; external: boolean }[] = [
    {
      icon: 'pulse',
      title: 'Known incidents',
      text: "Check Service status first: if something is already down, we're on it.",
      action: 'View Service status',
      link: '/status',
      external: false,
    },
    {
      icon: 'shield',
      title: 'Report abuse',
      text: 'Report spam or abuse coming from an Amelu domain through the same contact page.',
      action: 'Open contact page',
      link: CONTACT_URL,
      external: true,
    },
    {
      icon: 'star',
      title: "What's new",
      text: 'Recent changes to Amelu are listed in the changelog.',
      action: 'View changelog',
      link: '/changelog',
      external: false,
    },
  ];
  protected readonly checklist = [
    { title: 'The affected domain', text: 'And the mailbox or address, if the problem is limited to one.' },
    { title: 'When it happened', text: 'The approximate time, including your time zone.' },
    { title: 'What you saw', text: 'Any error message, or the full bounce message you received.' },
  ];
}
