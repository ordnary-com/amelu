import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, ChangelogEntry, errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { BUILD_INFO } from '../build-info';

/**
 * Amelu's entries from Ordnary's changelog (https://ordnary.com/changelog/rss.xml),
 * read through GET /api/changelog, which filters on the Amelu category.
 */
@Component({
  selector: 'amelu-changelog',
  imports: [PageHeader, DatePipe, RouterLink, Alert, EmptyState],
  template: `
    <amelu-page-header title="Changelog">What's new in Amelu.</amelu-page-header>

    @if (error(); as message) {
      <amelu-alert class="mb-5" kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
        {{ message }}
      </amelu-alert>
    }

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <section>
        <h2 [class]="ui.sectionTitle">Changes</h2>
        @if (entries(); as entries) {
          <ol [class]="ui.card + ' overflow-hidden'">
            @for (entry of entries; track entry.id) {
              <li class="border-b border-line px-4 py-4 last:border-b-0">
                <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 class="text-[14px] font-bold">{{ entry.title }}</h3>
                  @if (entry.date) {
                    <time class="text-[12px] text-muted" [attr.datetime]="entry.date">{{ entry.date | date: 'd MMM y' }}</time>
                  }
                </div>
                <ul class="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted">
                  @for (note of entry.notes; track $index) {
                    <li class="flex gap-2.5">
                      <span class="mt-[8px] size-1.5 flex-none rounded-full bg-muted/60"></span>
                      {{ note }}
                    </li>
                  }
                </ul>
              </li>
            } @empty {
              <amelu-empty-state title="No changes published yet" illustration="happy-news">
                Amelu's entries from the Ordnary changelog show up here as they are published.
              </amelu-empty-state>
            }
          </ol>
        } @else if (error()) {
          <amelu-empty-state [class]="ui.card" title="The changelog couldn't be loaded" [error]="true" />
        } @else {
          <div [class]="ui.card + ' overflow-hidden'" aria-hidden="true">
            @for (i of [1, 2, 3]; track i) {
              <div class="space-y-2 border-b border-line px-4 py-4 last:border-b-0">
                <span class="block h-3.5 w-56 animate-pulse rounded bg-bg"></span>
                <span class="block h-3 w-full animate-pulse rounded bg-bg"></span>
                <span class="block h-3 w-3/4 animate-pulse rounded bg-bg"></span>
              </div>
            }
          </div>
        }
      </section>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Latest change</h2>
          <div class="mt-1 flex items-center gap-2">
            @if (build.commitUrl) {
              <a [href]="build.commitUrl" target="_blank" rel="noreferrer" class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px] font-semibold text-link hover:underline">{{ build.commit }}</a>
            } @else {
              <span class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px] font-semibold">{{ build.commit }}</span>
            }
            <span class="text-[12px] text-muted">{{ build.version }}</span>
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
          <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <a href="https://ordnary.com/changelog" target="_blank" rel="noreferrer" class="text-[13px] font-medium text-link hover:underline">Ordnary changelog</a>
            <a href="https://ordnary.com/changelog/rss.xml" target="_blank" rel="noreferrer" class="text-[13px] font-medium text-link hover:underline">RSS feed</a>
          </div>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Something not working?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Check Service Status for known incidents, or contact support if a change causes trouble.
          </p>
          <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <a routerLink="/status" class="text-[13px] font-medium text-link hover:underline">Service Status</a>
            <a routerLink="/support" class="text-[13px] font-medium text-link hover:underline">Contact support</a>
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
