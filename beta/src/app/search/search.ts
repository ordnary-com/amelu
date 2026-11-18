import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, Mailbox } from '../api';
import { Domains } from '../domains';
import { NgTemplateOutlet } from '@angular/common';
import { Icon, IconName } from '../icon';
import { DOMAIN_STATUS } from '../status';
import { SearchResult, buildIndex, search } from './search-index';

/** Mailboxes are looked up for this many domains at most, so a big organization doesn't fire a request per domain. */
const MAILBOX_DOMAINS = 25;
/** Domains listed in the Domains card before you type. */
const BROWSE_DOMAINS = 4;

const BROWSE: { title: string; icon: IconName; links: string[]; domains?: boolean }[] = [
  { title: 'Domains', icon: 'globe', domains: true, links: ['/domains', '/domains/new'] },
  { title: 'Account and organization', icon: 'user', links: ['/account', '/account/appearance', '/account/api-keys', '/organization', '/organization/activity', '/organization/webmail'] },
  { title: 'Billing', icon: 'card', links: ['/billing/overview', '/billing/plans', '/billing/invoices'] },
  { title: 'Help', icon: 'lifebuoy', links: ['/support', '/changelog', '/status'] },
];

const PAGE_ICON: Record<string, IconName> = {
  '/': 'home',
  '/domains': 'globe',
  '/domains/new': 'plus',
  '/account': 'user',
  '/account/appearance': 'image',
  '/account/api-keys': 'key',
  '/account/terminate': 'circleX',
  '/organization': 'users',
  '/organization/activity': 'activity',
  '/organization/webmail': 'mail',
  '/billing/overview': 'card',
  '/billing/plans': 'star',
  '/billing/invoices': 'receipt',
  '/support': 'lifebuoy',
  '/changelog': 'doc',
  '/status': 'pulse',
};

/**
 * Search for any page, domain or mailbox: a button in the top right, opened
 * with a click, Cmd/Ctrl+K or "/". Empty, it shows the main places in cards;
 * typing "imap" finds every mailbox's IMAP and SMTP settings, "dkim" the DNS
 * pages, and so on (search-index.ts).
 */
@Component({
  selector: 'amelu-search',
  imports: [Icon, NgTemplateOutlet],
  template: `
    <button
      type="button"
      class="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink"
      aria-label="Search"
      [title]="'Search (' + shortcut + ')'"
      (click)="openSearch()"
    >
      <amelu-icon name="search" [size]="18" />
    </button>

    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[8vh] backdrop-blur-[2px]" (click)="close()" role="presentation">
        <div
          class="flex max-h-[84vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-lg bg-popover text-ink shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-title"
          (click)="$event.stopPropagation()"
        >
          <div class="flex-none px-7 pt-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 id="search-title" class="text-[17px] font-medium">Search</h2>
                <p class="mt-1 text-[14px] text-muted">Jump to any page, domain or mailbox.</p>
              </div>
              <button type="button" class="-mt-1 -mr-2 inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink" aria-label="Close" (click)="close()">
                <amelu-icon name="close" [size]="18" />
              </button>
            </div>
            <label class="mt-5 flex h-11 items-center gap-2.5 rounded-lg border border-line px-3.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
              <amelu-icon name="search" [size]="16" class="flex-none text-muted" />
              <input
                #input
                class="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
                placeholder="Try imap, dkim, password or a domain"
                aria-label="Search"
                autocomplete="off"
                spellcheck="false"
                role="combobox"
                aria-controls="search-results"
                [attr.aria-activedescendant]="items().length ? 'search-result-' + active() : null"
                [value]="query()"
                (input)="query.set($any($event.target).value); active.set(0)"
                (keydown)="keydown($event)"
              />
              <kbd class="rounded border border-line bg-bg px-1.5 text-[11px] text-muted">Esc</kbd>
            </label>
          </div>

          <div id="search-results" class="min-h-0 overflow-y-auto px-7 pt-5 pb-7" role="listbox">
            @if (query().trim()) {
              @if (results().length) {
                <ul class="rounded-lg border border-line px-4">
                  @for (result of results(); track result.link; let i = $index) {
                    <ng-container *ngTemplateOutlet="row; context: { $implicit: result, i: i }" />
                  }
                </ul>
              } @else {
                <p class="py-8 text-center text-[14px] text-muted">Nothing found for "{{ query().trim() }}".</p>
              }
            } @else {
              <div class="grid gap-5 md:grid-cols-2">
                @for (group of groups(); track group.title) {
                  <section class="overflow-hidden rounded-lg border border-line">
                    <h3 class="flex items-center gap-2.5 border-b border-line bg-bg/50 px-4 py-3 text-[15px] font-medium">
                      <amelu-icon [name]="group.icon" [size]="17" class="text-ink" />
                      {{ group.title }}
                    </h3>
                    <ul class="px-4">
                      @for (item of group.items; track item.result.link) {
                        <ng-container *ngTemplateOutlet="row; context: { $implicit: item.result, i: item.index }" />
                      }
                    </ul>
                  </section>
                }
              </div>
            }
            @if (loadingMailboxes() && query().trim()) {
              <p class="pt-3 text-[12px] text-muted">Loading mailboxes...</p>
            }
          </div>
        </div>
      </div>
    }

    <ng-template #row let-result let-i="i">
      <li
        [id]="'search-result-' + i"
        role="option"
        [attr.aria-selected]="i === active()"
        class="-mx-4 flex cursor-pointer items-start gap-3 border-b border-line px-4 py-3 last:border-b-0"
        [class.bg-bg]="i === active()"
        (mouseenter)="active.set(i)"
        (click)="go(result.link)"
      >
        <amelu-icon [name]="iconFor(result)" [size]="16" class="mt-0.5 flex-none text-muted" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[14px] font-medium">{{ result.label }}</span>
          <span class="mt-0.5 block truncate text-[13px] text-muted">{{ result.context ? result.context + ' · ' : '' }}{{ result.hint }}</span>
        </span>
        @if (i === active()) {
          <kbd class="mt-0.5 flex-none rounded border border-line bg-page px-1.5 text-[11px] text-muted" aria-hidden="true">Enter</kbd>
        }
      </li>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex', '(document:keydown)': 'globalKey($event)' },
})
export class Search {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly domains = inject(Domains).list;
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  private readonly mailboxes = signal(new Map<string, Mailbox[]>());
  protected readonly loadingMailboxes = signal(false);
  private mailboxesLoaded = false;

  private readonly index = computed(() => buildIndex(this.domains() ?? [], this.mailboxes()));
  protected readonly results = computed(() => {
    const domain = /^\/domains\/([^/?#]+)/.exec(this.router.url)?.[1] ?? null;
    return search(this.index(), this.query(), domain);
  });

  /** The cards shown before you type, numbered in reading order for the arrow keys. */
  protected readonly groups = computed(() => {
    const pages = new Map(this.index().filter((r) => r.kind === 'page' && !r.context).map((r) => [r.link, r]));
    const domains: SearchResult[] = (this.domains() ?? []).slice(0, BROWSE_DOMAINS).map((d) => ({
      label: d.name,
      context: '',
      hint: DOMAIN_STATUS[d.status].label,
      link: `/domains/${d.id}`,
      words: '',
      kind: 'domain',
    }));
    let index = 0;
    return BROWSE.map((group) => ({
      ...group,
      items: [...(group.domains ? domains : []), ...group.links.map((link) => pages.get(link)).filter((r) => !!r)].map((result) => ({
        result,
        index: index++,
      })),
    }));
  });

  /** What the arrow keys move through: the results, or the cards before you type. */
  protected readonly items = computed(() =>
    this.query().trim() ? this.results() : this.groups().flatMap((g) => g.items.map((item) => item.result)),
  );

  protected iconFor(result: SearchResult): IconName {
    if (result.kind === 'domain') return 'globe';
    if (result.kind === 'mailbox') return 'mail';
    return PAGE_ICON[result.link] ?? 'arrowRight';
  }

  constructor() {
    // Focus the field as soon as the dialog is there.
    effect(() => this.input()?.nativeElement.focus());
  }

  protected openSearch(): void {
    this.query.set('');
    this.active.set(0);
    this.open.set(true);
    void this.loadMailboxes();
  }

  protected close(): void {
    this.open.set(false);
  }

  protected go(link: string): void {
    this.close();
    void this.router.navigateByUrl(link);
  }

  protected keydown(event: KeyboardEvent): void {
    const count = this.items().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active.set((this.active() + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active.set((this.active() - 1 + count) % count);
    } else if (event.key === 'Enter' && count) {
      event.preventDefault();
      this.go(this.items()[this.active()].link);
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  protected globalKey(event: KeyboardEvent): void {
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.open()) this.close();
      else this.openSearch();
    } else if (event.key === '/' && !typing && !this.open()) {
      event.preventDefault();
      this.openSearch();
    }
  }

  /** Mailboxes come in once per session, the first time the search opens. */
  private async loadMailboxes(): Promise<void> {
    const domains = this.domains();
    if (this.mailboxesLoaded || !domains?.length) return;
    this.mailboxesLoaded = true;
    this.loadingMailboxes.set(true);
    const lists = await Promise.all(
      domains.slice(0, MAILBOX_DOMAINS).map((d) =>
        firstValueFrom(this.api.listMailboxes(d.id)).then(
          (list) => [d.id, list] as const,
          () => [d.id, [] as Mailbox[]] as const,
        ),
      ),
    );
    this.mailboxes.set(new Map(lists));
    this.loadingMailboxes.set(false);
  }
}
