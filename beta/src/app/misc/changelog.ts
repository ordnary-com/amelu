import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, ChangelogEntry, errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { Icon } from '../icon';
import { badgeClass } from '../status';
import { DitherShader } from '../login/dither-shader';
import { BUILD_INFO } from '../build-info';

/**
 * Amelu's entries from Ordnary's changelog (https://ordnary.com/changelog/rss.xml),
 * read through GET /api/changelog, which filters on the Amelu category.
 */
@Component({
  selector: 'amelu-changelog',
  imports: [PageHeader, DatePipe, RouterLink, Alert, EmptyState, Icon, DitherShader],
  template: `
    <amelu-page-header title="What's new">Changes to Amelu, newest first.</amelu-page-header>

    @if (error(); as message) {
      <amelu-alert class="mb-5" kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
        {{ message }}
      </amelu-alert>
    }

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        @if (groups(); as groups) {
          @for (group of groups; track group.month) {
            <section>
              <h2 class="mb-3 flex items-center gap-2 text-[14px] font-bold">
                {{ group.month ? (group.month + '-01' | date: 'MMMM y' : 'UTC') : 'Undated' }}
                <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ group.entries.length }}</span>
              </h2>
              <!-- A timeline: each release hangs off one thin line. -->
              <ol [class]="ui.card + ' px-4 py-1'">
                @for (entry of group.entries; track entry.id; let last = $last) {
                  <li class="relative flex items-start gap-3 py-3">
                    @if (!last) {
                      <span class="absolute top-[46px] -bottom-1 left-4 w-px bg-line" aria-hidden="true"></span>
                    }
                    <span class="relative inline-flex size-8 flex-none items-center justify-center rounded-full bg-accent/10 text-accent" aria-hidden="true">
                      <amelu-icon name="star" [size]="15" />
                    </span>
                    <div class="min-w-0 flex-1 pt-1.5">
                      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h3 class="flex flex-wrap items-center gap-2 text-[14px] font-bold">
                          {{ entry.title }}
                          @if (entry.id === latestId()) {
                            <span [class]="badge('ok')">Latest</span>
                          }
                        </h3>
                        @if (entry.date) {
                          <time class="flex-none text-[12px] text-muted tabular-nums" [attr.datetime]="entry.date">{{ entry.date | date: 'd MMM y' }}</time>
                        }
                      </div>
                      @if (entry.notes.length) {
                        <ul class="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted">
                          @for (note of entry.notes; track $index) {
                            <li class="flex gap-2.5">
                              <span class="mt-[8px] size-1.5 flex-none rounded-full bg-muted/60"></span>
                              {{ note }}
                            </li>
                          }
                        </ul>
                      }
                      @if (entry.link) {
                        <a [href]="entry.link" target="_blank" rel="noreferrer" [class]="ui.outline + ' mt-3 h-7 px-2.5 text-[12px]'">Read the full post</a>
                      }
                    </div>
                  </li>
                }
              </ol>
            </section>
          } @empty {
            <amelu-empty-state [class]="ui.card" title="No changes published yet" illustration="happy-news">
              Amelu's entries from the Ordnary changelog show up here as they are published.
            </amelu-empty-state>
          }
        } @else if (error()) {
          <amelu-empty-state [class]="ui.card" title="The changelog couldn't be loaded" [error]="true" />
        } @else {
          <div [class]="ui.card + ' px-4 py-1'" aria-hidden="true">
            @for (i of [1, 2, 3]; track i) {
              <div class="flex items-start gap-3 py-3">
                <span class="size-8 flex-none animate-pulse rounded-full bg-bg"></span>
                <div class="flex-1 space-y-2 pt-1.5">
                  <span class="block h-3.5 w-56 animate-pulse rounded bg-bg"></span>
                  <span class="block h-3 w-full animate-pulse rounded bg-bg"></span>
                  <span class="block h-3 w-3/4 animate-pulse rounded bg-bg"></span>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Latest change</h2>
          <div class="mt-2 flex items-center gap-2">
            @if (build.commitUrl) {
              <a [href]="build.commitUrl" target="_blank" rel="noreferrer" class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px] font-semibold text-link transition-colors hover:bg-accent/10">{{ build.commit }}</a>
            } @else {
              <span class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px] font-semibold">{{ build.commit }}</span>
            }
            <span class="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">{{ build.version }}</span>
          </div>
          @if (build.commitSubject) {
            <p class="mt-2 text-[13px] leading-snug font-medium">{{ build.commitSubject }}</p>
          }
          @if (build.commitDate) {
            <p class="mt-1 text-[12px] text-muted">
              Committed {{ build.commitDate | date: 'd MMM y, HH:mm' }}@if (build.dirty) {, with local changes}
            </p>
          }
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">All Ordnary products</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            This list only shows Amelu. The full changelog across Ordnary's products, with an RSS feed, lives on ordnary.com.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <a href="https://ordnary.com/changelog" target="_blank" rel="noreferrer" [class]="ui.outline">Ordnary changelog</a>
            <a href="https://ordnary.com/changelog/rss.xml" target="_blank" rel="noreferrer" [class]="ui.outline">RSS feed</a>
          </div>
        </section>
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="lifebuoy" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Something not working?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Check Service status for known incidents, or contact support if a change causes trouble.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <a routerLink="/status" class="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-[13px] font-medium hover:border-ink/20 hover:bg-bg">Service status</a>
            <a routerLink="/support" class="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-[13px] font-medium hover:border-ink/20 hover:bg-bg">Contact support</a>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class Changelog {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly build = BUILD_INFO;
  // undefined while loading
  protected readonly entries = signal<ChangelogEntry[] | undefined>(undefined);
  protected readonly error = signal<string | null>(null);
  protected readonly badge = badgeClass;
  protected readonly latestId = computed(() => this.entries()?.[0]?.id);
  // Grouped by month (YYYY-MM) in feed order; undated entries share the '' group.
  protected readonly groups = computed(() => {
    const entries = this.entries();
    if (!entries) return undefined;
    const groups: { month: string; entries: ChangelogEntry[] }[] = [];
    for (const entry of entries) {
      const month = entry.date.slice(0, 7);
      const last = groups.at(-1);
      if (last?.month === month) last.entries.push(entry);
      else groups.push({ month, entries: [entry] });
    }
    return groups;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.entries.set((await firstValueFrom(this.api.listChangelog())).entries);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not load the changelog'));
    }
  }
}
