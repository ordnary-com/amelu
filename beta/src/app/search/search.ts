import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, Mailbox } from '../api';
import { Domains } from '../domains';
import { Icon } from '../icon';
import { buildIndex, search } from './search-index';

/** Mailboxes are looked up for this many domains at most, so a big organization doesn't fire a request per domain. */
const MAILBOX_DOMAINS = 25;

/**
 * Search for any page, domain or mailbox: a field in the top bar, opened with
 * a click, Cmd/Ctrl+K or "/". Typing "imap" finds every mailbox's IMAP and
 * SMTP settings, "dkim" the DNS pages, and so on (search-index.ts).
 */
@Component({
  selector: 'amelu-search',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="flex h-9 w-full max-w-[420px] cursor-pointer items-center gap-2 rounded-lg bg-chrome-ink/10 px-3 text-[13px] text-chrome-ink/70 hover:bg-chrome-ink/15 max-mobile:w-9 max-mobile:justify-center max-mobile:px-0"
      aria-label="Search"
      (click)="openSearch()"
    >
      <amelu-icon name="search" [size]="15" />
      <span class="flex-1 text-left max-mobile:hidden">Search pages, domains, mailboxes</span>
      <kbd class="rounded border border-chrome-ink/25 px-1.5 font-sans text-[11px] max-mobile:hidden">{{ shortcut }}</kbd>
    </button>

    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" (click)="close()" role="presentation">
        <div
          class="w-full max-w-[640px] overflow-hidden rounded-xl border border-line bg-popover text-ink shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center gap-3 border-b border-line px-4">
            <amelu-icon name="search" [size]="17" class="text-muted" />
            <input
              #input
              class="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
              placeholder="Try imap, dkim, password or a domain"
              autofocus
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-controls="search-results"
              [attr.aria-activedescendant]="results().length ? 'search-result-' + active() : null"
              [value]="query()"
              (input)="query.set($any($event.target).value); active.set(0)"
              (keydown)="keydown($event)"
            />
            <kbd class="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
          </div>

          <ul id="search-results" class="max-h-[60vh] overflow-y-auto py-2" role="listbox">
            @for (result of results(); track result.link; let i = $index) {
              <li
                [id]="'search-result-' + i"
                role="option"
                [attr.aria-selected]="i === active()"
                class="mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
                [class.bg-bg]="i === active()"
                (mouseenter)="active.set(i)"
                (click)="go(result.link)"
              >
                <amelu-icon [name]="result.kind === 'domain' ? 'globe' : result.kind === 'mailbox' ? 'mail' : 'arrowRight'" [size]="15" class="flex-none text-muted" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[14px]">{{ result.label }}</span>
                  <span class="block truncate text-[12px] text-muted">
                    {{ result.context ? result.context + ' · ' : '' }}{{ result.hint }}
                  </span>
                </span>
              </li>
            } @empty {
              <li class="px-5 py-6 text-center text-[13px] text-muted">
                @if (query().trim()) {
                  Nothing found for "{{ query().trim() }}".
                } @else {
                  Type to search every page, domain and mailbox.
                }
              </li>
            }
          </ul>
          @if (loadingMailboxes()) {
            <p class="border-t border-line px-4 py-2 text-[12px] text-muted">Loading mailboxes...</p>
          }
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-1 justify-center max-mobile:flex-none', '(document:keydown)': 'globalKey($event)' },
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
    const count = this.results().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active.set((this.active() + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active.set((this.active() - 1 + count) % count);
    } else if (event.key === 'Enter' && count) {
      event.preventDefault();
      this.go(this.results()[this.active()].link);
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
