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
import { apiUrl } from '../config';
import { CATEGORY_LABEL, STATUS, timeAgo } from './support-meta';

const BODY_MAX = 20000;
// The API's limits on files sent with one message (handlers/support.go).
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 << 20;
const MAX_TOTAL_BYTES = 20 << 20;

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
                  @if (m.body) {
                    <div class="mt-2 pl-9 text-[14px] leading-relaxed break-words whitespace-pre-wrap">{{ m.body }}</div>
                  }
                  @if (m.attachments?.length) {
                    <ul class="mt-2.5 flex flex-wrap gap-2 pl-9">
                      @for (a of m.attachments; track a.id) {
                        <li>
                          <a [href]="attachmentUrl(t.id, a.id)" download [class]="fileChip + ' hover:border-ink/20'" [title]="'Download ' + a.filename">
                            <amelu-icon name="paperclip" [size]="14" class="flex-none text-muted" />
                            <span class="max-w-56 truncate">{{ a.filename }}</span>
                            <span class="flex-none text-muted">{{ size(a.size) }}</span>
                          </a>
                        </li>
                      }
                    </ul>
                  }
                </li>
              }
            </ol>
            <!-- The composer: a box with the text, the files to send, and a toolbar. Files can be
                 picked, dropped on it or pasted into it. -->
            <form class="border-t border-line px-5 py-4" (submit)="send($event)">
              @if (t.status === 'closed') {
                <p class="mb-2 text-[13px] text-muted">This ticket is closed. Replying opens it again.</p>
              }
              <div
                class="rounded border bg-surface transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
                [class]="dragging() ? 'border-accent bg-accent/5' : 'border-line'"
                (dragover)="onDragOver($event)"
                (dragleave)="dragging.set(false)"
                (drop)="onDrop($event)"
              >
                <label class="block">
                  <span class="sr-only">Reply</span>
                  <textarea
                    rows="3"
                    class="block max-h-72 min-h-20 w-full resize-none bg-transparent px-3.5 pt-3 pb-2 text-[14px] leading-relaxed outline-none [field-sizing:content] placeholder:text-muted"
                    [maxLength]="bodyMax"
                    [placeholder]="dragging() ? 'Drop files to attach them' : 'Write a reply'"
                    [value]="reply()"
                    (input)="reply.set($any($event.target).value)"
                    (paste)="onPaste($event)"
                    (keydown.meta.enter)="send($event)"
                    (keydown.control.enter)="send($event)"
                  ></textarea>
                </label>
                @if (files().length) {
                  <ul class="flex flex-wrap gap-2 px-3.5 pb-2.5" aria-label="Files to send">
                    @for (file of files(); track $index; let i = $index) {
                      <li [class]="fileChip + ' bg-well pr-1'">
                        <amelu-icon name="paperclip" [size]="14" class="flex-none text-muted" />
                        <span class="max-w-56 truncate">{{ file.name }}</span>
                        <span class="flex-none text-muted">{{ size(file.size) }}</span>
                        <button type="button" class="inline-flex size-6 flex-none cursor-pointer items-center justify-center rounded text-muted hover:bg-bg hover:text-bad" [attr.aria-label]="'Remove ' + file.name" (click)="removeFile(i)">
                          <amelu-icon name="close" [size]="13" />
                        </button>
                      </li>
                    }
                  </ul>
                }
                <div class="flex items-center gap-2 border-t border-line px-2 py-1.5">
                  <label class="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink" title="Attach files">
                    <amelu-icon name="paperclip" [size]="17" />
                    <span class="sr-only">Attach files</span>
                    <input type="file" multiple class="sr-only" (change)="onPick($event)" />
                  </label>
                  <span class="min-w-0 truncate text-[12px] text-muted">Up to {{ maxFiles }} files, {{ maxFileMb }} MB each</span>
                  <span class="ml-auto flex-none text-[12px] text-muted max-sm:hidden">{{ sendShortcut }} to send</span>
                  <button type="submit" [class]="ui.primary + ' flex-none'" [disabled]="!canSend()">{{ busy() ? 'Sending...' : 'Send' }}</button>
                </div>
              </div>
              @if (fileError(); as message) {
                <p class="mt-1.5 text-[12px] text-bad" role="alert">{{ message }}</p>
              }
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
  protected readonly files = signal<File[]>([]);
  protected readonly fileError = signal<string | null>(null);
  protected readonly dragging = signal(false);
  protected readonly maxFiles = MAX_FILES;
  protected readonly maxFileMb = MAX_FILE_BYTES >> 20;
  protected readonly sendShortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ Enter' : 'Ctrl Enter';
  protected readonly fileChip = 'inline-flex h-8 items-center gap-2 rounded border border-line bg-surface px-2.5 text-[13px]';
  protected readonly canSend = computed(() => !this.busy() && (this.reply().trim() !== '' || this.files().length > 0));

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
        this.files.set([]);
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

  protected attachmentUrl(ticketId: string, attachmentId: string): string {
    return apiUrl(`/api/support/tickets/${ticketId}/attachments/${attachmentId}`);
  }

  protected size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Adds files to the next reply, within the API's limits. */
  private addFiles(list: Iterable<File>): void {
    this.fileError.set(null);
    const next = [...this.files()];
    for (const file of list) {
      if (next.length >= MAX_FILES) {
        this.fileError.set(`At most ${MAX_FILES} files per message.`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        this.fileError.set(`${file.name} is larger than ${MAX_FILE_BYTES >> 20} MB.`);
        continue;
      }
      if (next.reduce((sum, f) => sum + f.size, 0) + file.size > MAX_TOTAL_BYTES) {
        this.fileError.set(`Files can be ${MAX_TOTAL_BYTES >> 20} MB together at most.`);
        continue;
      }
      next.push(file);
    }
    this.files.set(next);
  }

  protected removeFile(index: number): void {
    this.files.update((list) => list.filter((_, i) => i !== index));
    this.fileError.set(null);
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.addFiles(input.files);
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (event.dataTransfer?.files.length) this.addFiles(event.dataTransfer.files);
  }

  /** Pasted screenshots and files become attachments; pasted text stays text. */
  protected onPaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.files;
    if (!pasted?.length) return;
    event.preventDefault();
    this.addFiles(pasted);
  }

  protected ago(iso: string): string {
    return timeAgo(iso);
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    const t = this.ticket();
    const body = this.reply().trim();
    if (!t || !this.canSend()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.replySupportTicket(t.id, body, this.files()));
      this.reply.set('');
      this.files.set([]);
      this.fileError.set(null);
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
