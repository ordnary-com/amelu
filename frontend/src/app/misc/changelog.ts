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
import { BUILD_INFO } from '../build-info';

/**
 * Amelu's entries from Ordnary's changelog (https://ordnary.com/changelog/rss.xml),
 * read through GET /api/changelog, which filters on the Amelu category.
 */
@Component({
  selector: 'amelu-changelog',
  imports: [PageHeader, DatePipe, RouterLink, Alert, EmptyState, Icon],
  template: `
    <amelu-page-header title="What's new">Changes to Amelu, newest first.</amelu-page-header>

    @if (error(); as message) {
      <amelu-alert class="mb-5" kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
        {{ message }}
      </amelu-alert>
    }

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <section [class]="ui.panel">
        <div [class]="ui.panelHeader">
          <h2 [class]="ui.panelTitle">Changes</h2>
          @if (entries(); as list) {
            <span class="text-[13px] text-muted">{{ list.length }} {{ list.length === 1 ? 'change' : 'changes' }}</span>
          }
        </div>
        <div [class]="ui.well + ' space-y-5'">
          @if (groups(); as groups) {
            @for (group of groups; track group.month) {
              <div>
                <h3 class="mb-2 px-1 text-[12px] font-medium text-muted">
                  {{ group.month ? (group.month + '-01' | date: 'MMMM y') : 'Undated' }}
                  <span class="font-normal">· {{ group.entries.length }}</span>
                </h3>
                <!-- One white box per month, a release per row. -->
                <ol class="divide-y divide-line rounded-md border border-line bg-surface">
                  @for (entry of group.entries; track entry.id) {
                    <li class="px-4 py-3.5">
                      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h4 class="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                          {{ entry.title }}
                          @if (entry.id === latestId()) {
                            <span [class]="badge('ok')">Latest</span>
                          }
                        </h4>
                        @if (entry.date) {
                          <time class="flex-none text-[12px] text-muted tabular-nums" [attr.datetime]="entry.date">{{ entry.date | date: 'd MMM y' }}</time>
                        }
                      </div>
                      @if (entry.notes.length) {
                        <ul class="mt-2 space-y-1 text-[13px] leading-relaxed text-muted">
                          @for (note of entry.notes; track $index) {
                            <li class="flex gap-2.5">
                              <span class="mt-[8px] size-1 flex-none rounded-full bg-muted/60" aria-hidden="true"></span>
                              {{ note }}
                            </li>
                          }
                        </ul>
                      }
                      @if (entry.link) {
                        <a [href]="entry.link" target="_blank" rel="noreferrer" class="mt-2 inline-flex items-center gap-1 text-[13px] text-link hover:underline">
                          Read the full post <amelu-icon name="external" [size]="12" />
                        </a>
                      }
                    </li>
                  }
                </ol>
              </div>
            } @empty {
              <amelu-empty-state class="rounded-md border border-line bg-surface" title="No changes published yet" illustration="happy-news" [compact]="true">
                Amelu's entries from the Ordnary changelog show up here as they are published.
              </amelu-empty-state>
            }
          } @else if (error()) {
            <amelu-empty-state class="rounded-md border border-line bg-surface" title="The changelog couldn't be loaded" [error]="true" [compact]="true" />
          } @else {
            <div class="divide-y divide-line rounded-md border border-line bg-surface" aria-hidden="true">
              @for (i of [1, 2, 3]; track i) {
                <div class="space-y-2 px-4 py-3.5">
                  <span class="block h-3.5 w-56 animate-pulse rounded bg-bg"></span>
                  <span class="block h-3 w-full animate-pulse rounded bg-bg"></span>
                  <span class="block h-3 w-3/4 animate-pulse rounded bg-bg"></span>
                </div>
              }
            </div>
          }
        </div>
      </section>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">This version</h2>
          </div>
          <dl class="divide-y divide-line text-[13px]">
            <div class="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt class="text-muted">Version</dt>
              <dd>{{ build.version }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt class="text-muted">Commit</dt>
              <dd>
                @if (build.commitUrl) {
                  <a [href]="build.commitUrl" target="_blank" rel="noreferrer" class="font-mono text-[12px] text-link hover:underline">{{ build.commit }}</a>
                } @else {
                  <span class="font-mono text-[12px]">{{ build.commit }}</span>
                }
              </dd>
            </div>
            @if (build.commitDate) {
              <div class="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt class="text-muted">Built from</dt>
                <dd class="tabular-nums">{{ build.commitDate | date: 'd MMM y, HH:mm' }}@if (build.dirty) {, with local changes}</dd>
              </div>
            }
          </dl>
          @if (build.commitSubject) {
            <p class="border-t border-line bg-well px-4 py-3 text-[13px] leading-snug">{{ build.commitSubject }}</p>
          }
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">All Ordnary products</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              This list only shows Amelu. The full changelog across Ordnary's products, with an RSS feed, lives on ordnary.com.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <a href="https://ordnary.com/changelog" target="_blank" rel="noreferrer" [class]="ui.outline + ' bg-surface'">Ordnary changelog</a>
              <a href="https://ordnary.com/changelog/rss.xml" target="_blank" rel="noreferrer" [class]="ui.outline + ' bg-surface'">RSS feed</a>
            </div>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Something not working?</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Check <a routerLink="/status" class="text-link hover:underline">Service status</a> for known incidents, or
              <a routerLink="/support" class="text-link hover:underline">contact support</a> if a change causes trouble.
            </p>
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
