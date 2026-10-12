import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  notes: string[];
}

// Static release history, same source as the current dashboard (frontend/src/pages/ChangelogPage.tsx):
// there's no backend model for it, entries are added by hand with each release.
const ENTRIES: ChangelogEntry[] = [
  {
    version: '2026.7.1',
    date: '2026-07-10',
    title: 'Billing plans and invoices',
    notes: [
      'Added billing interval selection and plan cancellation from Billing → Plans.',
      'Invoices now sync directly from Stripe and are listed under Billing → Invoices.',
    ],
  },
  {
    version: '2026.6.2',
    date: '2026-06-18',
    title: 'Mailbox activity and pattern rewrites',
    notes: [
      'New mailboxes and address pattern rewrites can now be created from the domain sidebar.',
      'Added spam aggressiveness settings and recipient/sender denylists per domain.',
    ],
  },
  {
    version: '2026.6.1',
    date: '2026-06-02',
    title: 'Domain aliases and Bcc captures',
    notes: [
      'Domains can now have alias domains attached and managed independently.',
      'Added Bcc capture rules for silently copying mail to another address.',
    ],
  },
];

/** The current dashboard's /changelog. */
@Component({
  selector: 'amelu-changelog',
  imports: [PageHeader, DatePipe, RouterLink],
  template: `
    <amelu-page-header title="Changelog">What's new in Amelu.</amelu-page-header>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <section>
        <h2 [class]="ui.sectionTitle">Releases</h2>
        <ol [class]="ui.card + ' overflow-hidden'">
          @for (entry of entries; track entry.version) {
            <li class="border-b border-line px-4 py-4 last:border-b-0">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 class="text-[14px] font-bold">{{ entry.title }}</h3>
                <div class="flex items-center gap-2 text-[12px] text-muted">
                  <span class="rounded bg-bg px-1.5 py-0.5 font-mono text-[11px]">{{ entry.version }}</span>
                  <time [attr.datetime]="entry.date">{{ entry.date | date: 'd MMM y' }}</time>
                </div>
              </div>
              <ul class="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted">
                @for (note of entry.notes; track note) {
                  <li class="flex gap-2.5">
                    <span class="mt-[8px] size-1.5 flex-none rounded-full bg-muted/60"></span>
                    {{ note }}
                  </li>
                }
              </ul>
            </li>
          }
        </ol>
      </section>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Latest release</h2>
          <div class="mt-1 text-[18px] leading-tight font-bold">{{ entries[0].version }}</div>
          <p class="mt-1 text-[13px] text-muted">{{ entries[0].title }}, {{ entries[0].date | date: 'd MMM y' }}</p>
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
  protected readonly ui = UI;
  protected readonly entries = ENTRIES;
}
