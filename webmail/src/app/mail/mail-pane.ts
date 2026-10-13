import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Api, Folder, Summary, errorMessage } from '../api';
import { Folders } from '../folders';
import { Icon } from '../icon';
import { Alert } from '../alert';
import { EmptyState } from '../empty-state';
import { UI } from '../ui';
import { addrLabel, shortDate } from '../format';
import { MessageView } from './message-view';

const PAGE = 50;

/**
 * The list of a folder (or search results) on the left and the open message
 * on the right. On a phone only one of the two shows: the message when one
 * is open, the list otherwise.
 */
@Component({
  selector: 'amelu-mail-pane',
  imports: [FormsModule, Icon, Alert, EmptyState, MessageView],
  templateUrl: './mail-pane.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-1', '(document:keydown)': 'onKey($event)' },
})
export class MailPane {
  protected readonly ui = UI;
  private readonly api = inject(Api);
  protected readonly folders = inject(Folders);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap);
  private readonly query = toSignal(this.route.queryParamMap);

  protected readonly messageId = computed(() => this.params()?.get('messageId') ?? null);
  /** The folder from the URL, or the Inbox once the folders are known. */
  protected readonly folder = computed<Folder | undefined>(() => {
    const id = this.params()?.get('folderId');
    if (this.searching()) return undefined;
    return id ? this.folders.byId(id) : this.folders.byRole('inbox');
  });
  protected readonly searching = computed(() => this.router.url.startsWith('/search'));
  protected readonly q = computed(() => this.query()?.get('q') ?? '');

  protected search = '';
  protected readonly unreadOnly = signal(false);
  protected readonly flaggedOnly = signal(false);

  // undefined while loading, null when it failed
  protected readonly messages = signal<Summary[] | undefined | null>(undefined);
  protected readonly total = signal(0);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly movePicker = signal(false);
  protected readonly busy = signal(false);

  protected readonly anySelected = computed(() => this.selected().size > 0);
  protected readonly allSelected = computed(() => {
    const list = this.messages() ?? [];
    return list.length > 0 && list.every((m) => this.selected().has(m.id));
  });
  protected readonly isTrash = computed(() => this.folder()?.role === 'trash');
  protected readonly isJunk = computed(() => this.folder()?.role === 'junk');
  protected readonly isDrafts = computed(() => this.folder()?.role === 'drafts');
  protected readonly title = computed(() =>
    this.searching() ? `Search: ${this.q()}` : (this.folder()?.name ?? ''),
  );
  protected readonly moveTargets = computed(() =>
    this.folders.sorted().filter((f) => f.id !== this.folder()?.id && f.role !== 'drafts'),
  );

  private loadKey = '';

  constructor() {
    // Reload whenever the folder, the search, or a filter changes.
    effect(() => {
      const folder = this.folder();
      const q = this.q();
      const searching = this.searching();
      const unread = this.unreadOnly();
      const flagged = this.flaggedOnly();
      if (!searching && !folder) return;
      const key = JSON.stringify([folder?.id, q, searching, unread, flagged]);
      if (key === this.loadKey) return;
      this.loadKey = key;
      untracked(() => void this.load());
    });
    effect(() => {
      // The search box shows what's in the URL.
      this.search = this.q();
    });
  }

  protected async load(): Promise<void> {
    this.messages.set(undefined);
    this.selected.set(new Set());
    this.error.set(null);
    try {
      const page = await firstValueFrom(
        this.api.listMessages({
          folder: this.folder()?.id,
          q: this.q() || undefined,
          limit: PAGE,
          unread: this.unreadOnly(),
          flagged: this.flaggedOnly(),
        }),
      );
      this.messages.set(page.messages);
      this.total.set(page.total);
    } catch (err) {
      this.messages.set(null);
      this.error.set(errorMessage(err, 'Could not load messages'));
    }
  }

  protected async loadMore(): Promise<void> {
    const list = this.messages();
    if (!list || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      const page = await firstValueFrom(
        this.api.listMessages({
          folder: this.folder()?.id,
          q: this.q() || undefined,
          limit: PAGE,
          position: list.length,
          unread: this.unreadOnly(),
          flagged: this.flaggedOnly(),
        }),
      );
      this.messages.set([...list, ...page.messages]);
      this.total.set(page.total);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not load more messages'));
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected submitSearch(): void {
    const q = this.search.trim();
    if (q) void this.router.navigate(['/search'], { queryParams: { q } });
    else void this.router.navigateByUrl('/');
  }

  protected clearSearch(): void {
    this.search = '';
    void this.router.navigateByUrl('/');
  }

  protected open(message: Summary): void {
    if (message.draft) {
      void this.router.navigate(['/compose'], { queryParams: { draft: message.id } });
      return;
    }
    const folderId = this.folder()?.id ?? message.folderIds[0];
    void this.router.navigate(['/folder', folderId, message.id]);
    if (!message.seen) this.patchLocal([message.id], { seen: true });
  }

  protected closeMessage(): void {
    const folderId = this.folder()?.id;
    void this.router.navigateByUrl(folderId ? `/folder/${folderId}` : '/');
  }

  protected toggle(id: string, event?: Event): void {
    event?.stopPropagation();
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  protected toggleAll(): void {
    if (this.allSelected()) this.selected.set(new Set());
    else this.selected.set(new Set((this.messages() ?? []).map((m) => m.id)));
  }

  protected from(message: Summary): string {
    const list =
      this.folder()?.role === 'sent' || this.folder()?.role === 'drafts'
        ? message.to
        : message.from;
    const label = list.map(addrLabel).join(', ');
    return label || (list === message.to ? '(no recipient)' : '(unknown sender)');
  }

  protected date(message: Summary): string {
    return shortDate(message.receivedAt);
  }

  private ids(): string[] {
    const selected = this.selected();
    if (selected.size) return [...selected];
    const open = this.messageId();
    return open ? [open] : [];
  }

  private patchLocal(ids: string[], patch: Partial<Summary>): void {
    const list = this.messages();
    if (!list) return;
    const set = new Set(ids);
    this.messages.set(list.map((m) => (set.has(m.id) ? { ...m, ...patch } : m)));
  }

  private removeLocal(ids: string[]): void {
    const list = this.messages();
    if (!list) return;
    const set = new Set(ids);
    this.messages.set(list.filter((m) => !set.has(m.id)));
    this.total.set(Math.max(0, this.total() - ids.length));
    this.selected.set(new Set());
    if (this.messageId() && set.has(this.messageId()!)) this.closeMessage();
    void this.folders.load();
  }

  private async run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      return true;
    } catch (err) {
      this.error.set(errorMessage(err, fallback));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected async markSeen(seen: boolean, ids = this.ids()): Promise<void> {
    if (!ids.length) return;
    if (
      await this.run(
        () => firstValueFrom(this.api.setFlags(ids, { seen })),
        'Could not update the messages',
      )
    ) {
      this.patchLocal(ids, { seen });
      void this.folders.load();
    }
  }

  protected async flag(flagged: boolean, ids = this.ids()): Promise<void> {
    if (!ids.length) return;
    if (
      await this.run(
        () => firstValueFrom(this.api.setFlags(ids, { flagged })),
        'Could not update the messages',
      )
    )
      this.patchLocal(ids, { flagged });
  }

  protected async toggleFlag(message: Summary, event: Event): Promise<void> {
    event.stopPropagation();
    await this.flag(!message.flagged, [message.id]);
  }

  protected async remove(ids = this.ids()): Promise<void> {
    if (!ids.length) return;
    if (
      this.isTrash() &&
      !confirm(
        `Permanently delete ${ids.length === 1 ? 'this message' : ids.length + ' messages'}?`,
      )
    )
      return;
    if (await this.run(() => firstValueFrom(this.api.delete(ids)), 'Could not delete the messages'))
      this.removeLocal(ids);
  }

  protected async move(folder: Folder, ids = this.ids()): Promise<void> {
    this.movePicker.set(false);
    if (!ids.length) return;
    if (
      await this.run(
        () => firstValueFrom(this.api.move(ids, folder.id)),
        'Could not move the messages',
      )
    )
      this.removeLocal(ids);
  }

  protected async spam(spam: boolean, ids = this.ids()): Promise<void> {
    if (!ids.length) return;
    if (
      await this.run(() => firstValueFrom(this.api.spam(ids, spam)), 'Could not move the messages')
    )
      this.removeLocal(ids);
  }

  /** The open message's neighbours, for j/k. */
  private step(delta: 1 | -1): void {
    const list = this.messages();
    const open = this.messageId();
    if (!list?.length) return;
    const index = open ? list.findIndex((m) => m.id === open) : -1;
    const next = list[index + delta] ?? (index === -1 ? list[0] : undefined);
    if (next) this.open(next);
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    )
      return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key) {
      case 'j':
        this.step(1);
        break;
      case 'k':
        this.step(-1);
        break;
      case 'c':
        void this.router.navigateByUrl('/compose');
        break;
      case 'r':
        if (this.messageId())
          void this.router.navigate(['/compose'], { queryParams: { reply: this.messageId() } });
        break;
      case '/':
        event.preventDefault();
        (document.getElementById('mail-search') as HTMLInputElement | null)?.focus();
        break;
      case 'Escape':
        if (this.movePicker()) this.movePicker.set(false);
        else if (this.anySelected()) this.selected.set(new Set());
        else if (this.messageId()) this.closeMessage();
        break;
    }
  }
}
