import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { Api, SupportMessage, SupportTicket, errorMessage } from '../api';
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
  imports: [Alert, Icon, Avatar, DatePipe, RouterLink],
  template: `
    @if (ticket(); as t) {
      <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div class="min-w-0">
          <h1 class="flex min-w-0 items-center gap-2 text-[22px] leading-tight font-normal">
            <a routerLink="/support" class="flex-none text-link hover:underline">Support</a>
            <amelu-icon name="chevronRight" [size]="16" class="flex-none text-muted" />
            <span class="truncate">{{ t.subject }}</span>
          </h1>
          <p class="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-muted">
            <span class="inline-flex items-center gap-1.5" [class]="status[t.status].text"><amelu-icon [name]="status[t.status].icon" [size]="15" />{{ status[t.status].label }}</span>
            <span aria-hidden="true">·</span>
            <span>#{{ t.number }}, opened by {{ t.openedByName }} on {{ t.createdAt | date: 'd MMM y' }}</span>
          </p>
        </div>
        @if (t.status !== 'closed') {
          <button type="button" [class]="ui.outline + ' h-9'" [disabled]="busy()" (click)="close()">
            <amelu-icon name="check" [size]="14" />
            Close ticket
          </button>
        }
      </div>

      <div class="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div class="min-w-0 space-y-5">
          @if (error(); as message) {
            <amelu-alert>{{ message }}</amelu-alert>
          }

          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Conversation</h2>
            </div>
            <ol class="divide-y divide-line">
              @for (m of t.messages ?? []; track m.id) {
                <li class="px-5 py-4" [class.bg-well]="m.authorKind === 'staff'">
                  <div class="flex items-center gap-2">
                    <amelu-avatar class="size-7" [size]="28" [src]="m.authorAvatarUrl" [name]="m.authorName" [email]="m.authorEmail" [gravatar]="true" [title]="tooltip(m)" />
                    <span class="truncate text-[14px] font-medium" [title]="tooltip(m)">{{ m.authorName }}</span>
                    @if (m.authorKind === 'staff') {
                      <img src="/ordnary-mark-blue.png" alt="Ordnary staff" [title]="tooltip(m)" class="size-3.5 flex-none" />
                      <span class="truncate text-[13px] text-muted">{{ m.authorTitle }}</span>
                    }
                    <span class="ml-auto flex-none text-[13px] text-muted" [title]="m.createdAt | date: 'medium'">{{ m.createdAt | date: 'd MMM, HH:mm' }}</span>
                  </div>
                  <div class="mt-2 pl-9 text-[14px] leading-relaxed break-words whitespace-pre-wrap">{{ m.body }}</div>
                </li>
              }
            </ol>
            <form class="border-t border-line px-5 py-4" (submit)="send($event)">
              @if (t.status === 'closed') {
                <p class="mb-2 text-[13px] text-muted">This ticket is closed. Replying opens it again.</p>
              }
              <div class="flex items-end gap-2 rounded border border-line bg-surface p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                <label class="min-w-0 flex-1">
                  <span class="sr-only">Reply</span>
                  <textarea
                    rows="2"
                    class="block max-h-60 w-full resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed outline-none [field-sizing:content] placeholder:text-muted"
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
          </section>
        </div>

        <aside class="space-y-5">
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader"><h2 [class]="ui.setTitle">Details</h2></div>
            <dl class="divide-y divide-line text-[14px]">
              <div [class]="row"><dt [class]="key">Status</dt><dd class="min-w-0 flex-1" [class]="status[t.status].text">{{ status[t.status].label }}</dd></div>
              <div [class]="row"><dt [class]="key">Topic</dt><dd class="min-w-0 flex-1 truncate">{{ categoryLabel[t.category] }}</dd></div>
              @if (t.domainName && t.domainId) {
                <div [class]="row"><dt [class]="key">Domain</dt><dd class="min-w-0 flex-1 truncate"><a [routerLink]="['/domains', t.domainId]" class="text-link hover:underline">{{ t.domainName }}</a></dd></div>
              }
              <div [class]="row"><dt [class]="key">Opened by</dt><dd class="min-w-0 flex-1 truncate">{{ t.openedByName }}</dd></div>
              <div [class]="row"><dt [class]="key">Opened</dt><dd class="min-w-0 flex-1" [title]="t.createdAt | date: 'medium'">{{ t.createdAt | date: 'd MMM y, HH:mm' }}</dd></div>
              <div [class]="row"><dt [class]="key">Last activity</dt><dd class="min-w-0 flex-1" [title]="t.updatedAt | date: 'medium'">{{ ago(t.updatedAt) }}</dd></div>
            </dl>
          </section>

          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Your Tickets</h2>
              <a routerLink="/support/new" [class]="ui.setAction" aria-label="New ticket" title="New ticket"><amelu-icon name="plus" [size]="18" /></a>
            </div>
            <ul class="divide-y divide-line">
              @for (other of others(); track other.id) {
                <li>
                  <a
                    [routerLink]="['/support/tickets', other.id]"
                    class="flex items-start gap-2.5 px-5 py-2.5 text-[14px] hover:bg-bg/50"
                    [class.bg-accent/10]="other.id === t.id"
                    [attr.aria-current]="other.id === t.id ? 'page' : null"
                  >
                    <span class="mt-2 size-1.5 flex-none rounded-full" [class]="status[other.status].dot" aria-hidden="true"></span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate" [class]="other.id === t.id ? 'font-medium text-link' : ''">{{ other.subject }}</span>
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
      <h1 class="flex items-center gap-2 text-[22px] leading-tight font-normal">
        <a routerLink="/support" class="text-link hover:underline">Support</a>
        <amelu-icon name="chevronRight" [size]="16" class="text-muted" />
        Ticket not found
      </h1>
      <p class="mt-1 text-[14px] text-muted">This ticket doesn't exist or belongs to another organization.</p>
      <a routerLink="/support" [class]="ui.outline + ' mt-5'">Back to support</a>
    } @else {
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div [class]="ui.setCard + ' h-48 animate-pulse'"></div>
        <div [class]="ui.setCard + ' h-56 animate-pulse'"></div>
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
  // Details rows: a muted label beside the value.
  protected readonly row = 'flex items-center gap-4 px-5 py-2.5';
  protected readonly key = 'w-28 flex-none text-[13px] text-muted';

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
