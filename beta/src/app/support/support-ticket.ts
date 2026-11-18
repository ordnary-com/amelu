import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { Api, SupportTicket, errorMessage } from '../api';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { UI } from '../ui';
import { CATEGORY_LABEL, STATUS, timeAgo } from './support-meta';

const BODY_MAX = 20000;

/**
 * /support/tickets/:id: the conversation and a reply box, with the ticket's
 * details and the organization's other tickets in a sidebar on the right.
 */
@Component({
  selector: 'amelu-support-ticket',
  imports: [PageHeader, Alert, Icon, DatePipe, RouterLink],
  template: `
    @if (ticket(); as t) {
      <amelu-page-header [title]="t.subject" [crumbs]="[{ label: 'Support', link: '/support' }, { label: '#' + t.number }]">
        <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[12px] font-medium text-ink">
            <span class="size-1.5 rounded-full" [class]="status[t.status].dot" aria-hidden="true"></span>{{ status[t.status].label }}
          </span>
          <span class="text-muted">#{{ t.number }} · opened {{ ago(t.createdAt) }} by {{ t.openedByName }}</span>
        </span>
      </amelu-page-header>

      <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
        <section class="min-w-0">
          @if (error(); as message) {
            <amelu-alert class="mb-4 block">{{ message }}</amelu-alert>
          }

          <div class="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <ol>
              @for (m of t.messages ?? []; track m.id; let first = $first) {
                <li
                  class="relative flex gap-3.5 px-5 py-5"
                  [class.border-t]="!first"
                  [class.border-line]="!first"
                  [class.bg-accent-soft/40]="m.authorKind === 'staff'"
                >
                  @if (m.authorKind === 'staff') {
                    <span class="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden="true"></span>
                  }
                  <span
                    class="flex size-8 flex-none items-center justify-center rounded-full text-[12px] font-semibold"
                    [class]="m.authorKind === 'staff' ? 'bg-accent text-white' : 'bg-bg text-ink-soft ring-1 ring-line'"
                    aria-hidden="true"
                  >{{ m.authorKind === 'staff' ? 'A' : initial(m.authorName) }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span class="text-[13px] font-semibold text-ink">{{ m.authorName }}</span>
                      @if (m.authorKind === 'staff') {
                        <span class="rounded-full bg-accent/10 px-1.5 py-px text-[11px] font-medium text-link">Support</span>
                      }
                      <span class="text-[12px] text-muted" [title]="m.createdAt | date: 'medium'">{{ ago(m.createdAt) }}</span>
                    </div>
                    <div class="mt-1.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap text-ink-soft">{{ m.body }}</div>
                  </div>
                </li>
              }
            </ol>

            <form class="border-t border-line bg-bg/40 p-4" (submit)="send($event)">
              <label for="reply" class="sr-only">Reply</label>
              @if (t.status === 'closed') {
                <p class="mb-3 flex items-center gap-2 text-[13px] text-muted">
                  <amelu-icon name="circleCheck" [size]="14" />
                  This ticket is closed. Replying opens it again.
                </p>
              }
              <div class="rounded-lg border border-line bg-surface transition-shadow focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
                <textarea
                  id="reply"
                  rows="4"
                  class="block w-full resize-none rounded-lg bg-transparent px-3.5 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted"
                  [maxLength]="bodyMax"
                  placeholder="Write a reply…"
                  [value]="reply()"
                  (input)="reply.set($any($event.target).value)"
                  (keydown.meta.enter)="send($event)"
                  (keydown.control.enter)="send($event)"
                ></textarea>
                <div class="flex items-center justify-between gap-2 px-3 pb-3">
                  <span class="text-[12px] text-muted"><kbd class="rounded border border-line px-1 font-sans text-[11px]">⌘</kbd> <kbd class="rounded border border-line px-1 font-sans text-[11px]">Enter</kbd> to send</span>
                  <button type="submit" [class]="ui.primary + ' rounded-full px-3.5'" [disabled]="busy() || !reply().trim()">
                    {{ busy() ? 'Sending…' : 'Send' }}
                    <amelu-icon name="arrowRight" [size]="14" />
                  </button>
                </div>
              </div>
              <p class="mt-2 text-[12px] text-muted">We'll email {{ t.openedByName }} when support replies.</p>
            </form>
          </div>
        </section>

        <aside class="space-y-4 xl:sticky xl:top-6" aria-label="Ticket details">
          <section class="rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <h2 class="text-[12px] font-medium tracking-wide text-muted uppercase">Details</h2>
            <dl class="mt-3 space-y-3 text-[13px]">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted">Status</dt>
                <dd class="inline-flex items-center gap-1.5 font-medium">
                  <span class="size-1.5 rounded-full" [class]="status[t.status].dot" aria-hidden="true"></span>{{ status[t.status].label }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted">Topic</dt>
                <dd class="truncate text-right font-medium">{{ categoryLabel[t.category] }}</dd>
              </div>
              @if (t.domainName && t.domainId) {
                <div class="flex items-center justify-between gap-3">
                  <dt class="text-muted">Domain</dt>
                  <dd class="truncate"><a [routerLink]="['/domains', t.domainId]" class="font-medium text-link hover:underline">{{ t.domainName }}</a></dd>
                </div>
              }
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted">Opened by</dt>
                <dd class="truncate text-right font-medium">{{ t.openedByName }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted">Opened</dt>
                <dd class="font-medium" [title]="t.createdAt | date: 'medium'">{{ t.createdAt | date: 'd MMM y' }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted">Last activity</dt>
                <dd class="font-medium" [title]="t.updatedAt | date: 'medium'">{{ ago(t.updatedAt) }}</dd>
              </div>
            </dl>
            @if (t.status !== 'closed') {
              <button type="button" [class]="ui.outline + ' mt-4 w-full justify-center rounded-full'" [disabled]="busy()" (click)="close()">
                <amelu-icon name="check" [size]="14" />
                Close ticket
              </button>
            }
          </section>

          <section class="rounded-xl border border-line bg-surface p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div class="flex items-center justify-between px-2 pt-1 pb-2">
              <h2 class="text-[12px] font-medium tracking-wide text-muted uppercase">Your tickets</h2>
              <a routerLink="/support/new" class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-link hover:bg-accent/10">
                <amelu-icon name="plus" [size]="12" />
                New
              </a>
            </div>
            <ul class="space-y-0.5">
              @for (other of others(); track other.id) {
                <li>
                  <a
                    [routerLink]="['/support/tickets', other.id]"
                    class="flex items-start gap-2.5 rounded-lg px-2 py-2 text-[13px] transition-colors"
                    [class]="other.id === t.id ? 'bg-accent/10 text-ink' : 'text-ink-soft hover:bg-bg'"
                    [attr.aria-current]="other.id === t.id ? 'page' : null"
                  >
                    <span class="mt-1.5 size-1.5 flex-none rounded-full" [class]="status[other.status].dot" aria-hidden="true"></span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate" [class.font-medium]="other.id === t.id">{{ other.subject }}</span>
                      <span class="block text-[11px] text-muted tabular-nums">#{{ other.number }} · {{ ago(other.updatedAt) }}</span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          </section>
        </aside>
      </div>
    } @else if (notFound()) {
      <amelu-page-header title="Ticket not found" [crumbs]="[{ label: 'Support', link: '/support' }]">
        This ticket doesn't exist or belongs to another organization.
      </amelu-page-header>
      <a routerLink="/support" [class]="ui.outline">Back to support</a>
    } @else {
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div class="h-64 animate-pulse rounded-xl border border-line bg-surface"></div>
        <div class="h-56 animate-pulse rounded-xl border border-line bg-surface"></div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SupportTicketPage {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly status = STATUS;
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly bodyMax = BODY_MAX;

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id')!)), { requireSync: true });

  protected readonly ticket = signal<SupportTicket | null>(null);
  protected readonly list = signal<SupportTicket[]>([]);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reply = signal('');
  protected readonly busy = signal(false);

  /** Open tickets first, then closed ones; at most 12 in the sidebar. */
  protected readonly others = computed(() => {
    const open = this.list().filter((t) => t.status !== 'closed');
    const closed = this.list().filter((t) => t.status === 'closed');
    return [...open, ...closed].slice(0, 12);
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.ticket.set(null);
        this.reply.set('');
        void this.load(id);
      });
    });
    void this.loadList();
  }

  private async load(id: string): Promise<void> {
    this.error.set(null);
    try {
      this.ticket.set(await firstValueFrom(this.api.getSupportTicket(id)));
      this.notFound.set(false);
    } catch (err) {
      if ((err as { status?: number })?.status === 404) this.notFound.set(true);
      else this.error.set(errorMessage(err, 'Could not load the ticket'));
    }
  }

  private async loadList(): Promise<void> {
    try {
      this.list.set(await firstValueFrom(this.api.listSupportTickets()));
    } catch {
      // The sidebar list is a convenience; the ticket itself still shows.
    }
  }

  protected ago(iso: string): string {
    return timeAgo(iso);
  }

  protected initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    const t = this.ticket();
    const body = this.reply().trim();
    if (!t || !body || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.replySupportTicket(t.id, body));
      this.reply.set('');
      await Promise.all([this.load(t.id), this.loadList()]);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not send your reply'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async close(): Promise<void> {
    const t = this.ticket();
    if (!t || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.closeSupportTicket(t.id));
      await Promise.all([this.load(t.id), this.loadList()]);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not close the ticket'));
    } finally {
      this.busy.set(false);
    }
  }
}
