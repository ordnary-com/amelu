import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';

export interface Crumb {
  label: string;
  /** Omit for the current page. */
  link?: string;
}

/**
 * The page title with its breadcrumb in it, like a support ticket's:
 * "Domains › example.com › Recent activity", the parents as links. Crumbs
 * without a link are left out; the title is the current page.
 */
@Component({
  selector: 'amelu-crumb-title',
  imports: [RouterLink, Icon],
  template: `
    <h1 class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[22px] leading-tight font-normal" [class.text-ink]="onHero()">
      @for (crumb of parents(); track $index) {
        <a [routerLink]="crumb.link" class="max-w-[16rem] flex-none truncate text-link hover:underline">{{ crumb.label }}</a>
        <amelu-icon name="chevronRight" [size]="16" class="flex-none text-muted" />
      }
      <span class="min-w-0 truncate" [title]="title()">{{ title() }}</span>
    </h1>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class CrumbTitle {
  readonly title = input.required<string>();
  readonly crumbs = input<Crumb[]>([]);
  /** On the hero banner the title keeps the ink colour instead of the banner's. */
  readonly onHero = input(false);
  protected readonly parents = computed(() => this.crumbs().filter((crumb) => crumb.link && crumb.label));
}

/**
 * Title with breadcrumb and a line of description, with buttons on the right.
 * The description goes in as content; buttons or links marked with an
 * `actions` attribute go on the right.
 */
@Component({
  selector: 'amelu-page-header',
  imports: [CrumbTitle],
  template: `
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <amelu-crumb-title [title]="title()" [crumbs]="crumbs()" />
        <div class="mt-1 max-w-2xl text-[13px] text-muted empty:hidden"><ng-content /></div>
      </div>
      <div class="flex flex-wrap gap-2 empty:hidden"><ng-content select="[actions]" /></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mb-5 block' },
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly crumbs = input<Crumb[]>([]);
}
