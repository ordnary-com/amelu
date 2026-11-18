import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { Api, SupportMessage, SupportTicket, errorMessage } from '../api';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { Avatar } from '../avatar';
import { UI } from '../ui';
import { CATEGORY_LABEL, STATUS, timeAgo } from './support-meta';

const BODY_MAX = 20000;

/**
 * /support/tickets/:id: the conversation and a reply box, with the ticket's
 * details and the organization's other tickets in a sidebar on the right.
 */
@Component({
  selector: 'amelu-support-ticket',
  imports: [PageHeader, Alert, Icon, Avatar, DatePipe, RouterLink],
  template: `
    @if (ticket(); as t) {
      <amelu-page-header [title]="t.subject" [crumbs]="[{ label: 'Support', link: '/support' }, { label: '#' + t.number }]">
        <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="rounded px-1.5 py-0.5 text-[11px] font-medium" [class]="status[t.status].badge">{{ status[t.status].label }}</span>
          <span>#{{ t.number }} · opened by {{ t.openedByName }} on {{ t.createdAt | date: 'd MMM y' }}</span>
        </span>
        @if (t.status !== 'closed') {
          <button actions type="button" [class]="ui.outline" [disabled]="busy()" (click)="close()">
            <amelu-icon name="check" [size]="14" />
            Close ticket
          </button>
        }
      </amelu-page-header>

      <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div class="min-w-0 space-y-6">
          @if (error(); as message) {
            <amelu-alert>{{ message }}</amelu-alert>
          }

          <section>
            <h2 [class]="ui.sectionTitle">Conversation</h2>
            <ol [class]="ui.card + ' divide-y divide-line overflow-hidden'">
              @for (m of t.messages ?? []; track m.id) {
                <li class="px-4 py-3" [class.bg-bg/40]="m.authorKind === 'staff'">
                  <div class="flex items-center gap-2">
                    <amelu-avatar class="size-6" [size]="24" [src]="m.authorAvatarUrl" [name]="m.authorName" [email]="m.authorEmail" [gravatar]="true" [title]="tooltip(m)" />
                    <span class="truncate text-[13px] font-medium" [title]="tooltip(m)">{{ m.authorName }}</span>
                    @if (m.authorKind === 'staff') {
                      <img src="/ordnary-mark-blue.png" alt="Ordnary staff" [title]="tooltip(m)" class="size-3.5 flex-none" />
                      <span class="truncate text-[12px] text-muted">{{ m.authorTitle }}</span>
                    }
                    <span class="ml-auto flex-none text-[12px] text-muted" [title]="m.createdAt | date: 'medium'">{{ m.createdAt | date: 'd MMM, HH:mm' }}</span>
                  </div>
                  <div class="mt-2 pl-8 text-[13px] leading-relaxed break-words whitespace-pre-wrap">{{ m.body }}</div>
                </li>
              }
            </ol>
          </section>

          <form (submit)="send($event)">
            @if (t.status === 'closed') {
              <p class="mb-2 text-[13px] text-muted">This ticket is closed. Replying opens it again.</p>
            }
            <div [class]="ui.card + ' flex items-end gap-2 p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30'">
              <label class="min-w-0 flex-1">
                <span class="sr-only">Reply</span>
                <textarea
                  rows="2"
                  class="block max-h-60 w-full resize-none bg-transparent px-2 py-1.5 text-[13px] leading-relaxed outline-none [field-sizing:content] placeholder:text-muted"
                  [maxLength]="bodyMax"
                  placeholder="Write a reply"
                  [value]="reply()"
                  (input)="reply.set($any($event.target).value)"
                  (keydown.meta.enter)="send($event)"
                  (keydown.control.enter)="send($event)"
                ></textarea>
              </label>
              <button type="submit" [class]="ui.primary + ' flex-none'" [disabled]="busy() || !reply().trim()">{{ busy() ? 'Sending...' : 'Send' }}</button>
            </div>
          </form>
        </div>

        <aside class="space-y-6">
          <section>
            <h2 [class]="ui.sectionTitle">Details</h2>
            <dl [class]="ui.card + ' divide-y divide-line overflow-hidden'">
              <div class="flex items-center gap-4 px-4 py-2.5">
                <dt class="w-28 flex-none text-[13px] text-muted">Status</dt>
                <dd class="min-w-0 flex-1 text-[13px]"><span class="rounded px-1.5 py-0.5 text-[11px] font-medium" [class]="status[t.status].badge">{{ status[t.status].label }}</span></dd>
              </div>
              <div class="flex items-center gap-4 px-4 py-2.5">
                <dt class="w-28 flex-none text-[13px] text-muted">Topic</dt>
                <dd class="min-w-0 flex-1 truncate text-[13px]">{{ categoryLabel[t.category] }}</dd>
              </div>
              @if (t.domainName && t.domainId) {
                <div class="flex items-center gap-4 px-4 py-2.5">
                  <dt class="w-28 flex-none text-[13px] text-muted">Domain</dt>
                  <dd class="min-w-0 flex-1 truncate text-[13px]"><a [routerLink]="['/domains', t.domainId]" class="text-link hover:underline">{{ t.domainName }}</a></dd>
                </div>
              }
              <div class="flex items-center gap-4 px-4 py-2.5">
                <dt class="w-28 flex-none text-[13px] text-muted">Opened by</dt>
                <dd class="min-w-0 flex-1 truncate text-[13px]">{{ t.openedByName }}</dd>
              </div>
              <div class="flex items-center gap-4 px-4 py-2.5">
                <dt class="w-28 flex-none text-[13px] text-muted">Opened</dt>
                <dd class="min-w-0 flex-1 text-[13px]" [title]="t.createdAt | date: 'medium'">{{ t.createdAt | date: 'd MMM y, HH:mm' }}</dd>
              </div>
              <div class="flex items-center gap-4 px-4 py-2.5">
                <dt class="w-28 flex-none text-[13px] text-muted">Last activity</dt>
                <dd class="min-w-0 flex-1 text-[13px]" [title]="t.updatedAt | date: 'medium'">{{ ago(t.updatedAt) }}</dd>
              </div>
            </dl>
          </section>

          <section>
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-[14px] font-bold">Your tickets</h2>
              <a routerLink="/support/new" class="text-[13px] font-medium text-link hover:underline">New ticket</a>
            </div>
            <ul [class]="ui.card + ' divide-y divide-line overflow-hidden'">
              @for (other of others(); track other.id) {
                <li>
                  <a
                    [routerLink]="['/support/tickets', other.id]"
                    class="flex items-start gap-2.5 px-4 py-2.5 text-[13px] hover:bg-bg/60"
                    [class.bg-bg/60]="other.id === t.id"
                    [attr.aria-current]="other.id === t.id ? 'page' : null"
                  >
                    <span class="mt-1.5 size-1.5 flex-none rounded-full" [class]="status[other.status].dot" aria-hidden="true"></span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate" [class.font-medium]="other.id === t.id">{{ other.subject }}</span>
                      <span class="block text-[12px] text-muted tabular-nums">#{{ other.number }} · {{ ago(other.updatedAt) }}</span>
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
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div [class]="ui.card + ' h-48 animate-pulse'"></div>
        <div [class]="ui.card + ' h-56 animate-pulse'"></div>
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

  /** Name, role and email on hover. */
  protected tooltip(m: SupportMessage): string {
    return m.authorKind === 'staff'
      ? [m.authorName, `${m.authorTitle ?? 'Amelu Support'}, Ordnary staff`, m.authorEmail].filter(Boolean).join('\n')
      : [m.authorName, m.authorEmail].filter(Boolean).join('\n');
  }

  protected ago(iso: string): string {
    return timeAgo(iso);
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
