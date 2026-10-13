import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Folder, FolderRole, errorMessage } from '../api';
import { Folders } from '../folders';
import { Session } from '../session';
import { Icon, IconName } from '../icon';
import { UI } from '../ui';
import { fileSize } from '../format';

const ROLE_ICON: Record<FolderRole, IconName> = {
  inbox: 'inbox',
  drafts: 'pencil',
  sent: 'send',
  archive: 'archive',
  junk: 'alertOctagon',
  trash: 'trash',
};

type ThemeChoice = 'dark' | 'light' | 'system';

/**
 * Top bar and the folder column. On a phone the column is a drawer, opened
 * from the menu button, and the list and message panes take turns.
 */
@Component({
  selector: 'amelu-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, FormsModule],
  templateUrl: './shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-dvh flex-col' },
})
export class Shell {
  protected readonly ui = UI;
  protected readonly folders = inject(Folders);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly drawer = signal(false);
  protected readonly menu = signal(false);
  protected readonly newFolder = signal<string | null>(null);
  protected readonly renaming = signal<{ id: string; name: string } | null>(null);
  protected readonly folderError = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly account = this.session.account;
  protected readonly quota = computed(() => {
    const quota = this.account()?.quota;
    if (!quota || !quota.maxBytes) return null;
    return {
      used: fileSize(quota.usedBytes),
      max: fileSize(quota.maxBytes),
      percent: Math.min(100, Math.round((quota.usedBytes / quota.maxBytes) * 100)),
    };
  });

  protected readonly theme = signal<ThemeChoice>(readTheme());
  protected readonly themes: { value: ThemeChoice; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ];

  protected readonly link =
    'flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-white/80 hover:bg-white/10 hover:text-white [.active&]:bg-white/15 [.active&]:text-white';

  constructor() {
    void this.folders.load();
    // Keep the drawer closed after navigating on a phone.
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.drawer.set(false));
  }

  protected icon(folder: Folder): IconName {
    return folder.role ? ROLE_ICON[folder.role] : 'folder';
  }

  protected depth(folder: Folder): number {
    let depth = 0;
    let current: Folder | undefined = folder;
    while (current?.parentId && depth < 6) {
      current = this.folders.byId(current.parentId);
      depth++;
    }
    return depth;
  }

  protected setTheme(choice: ThemeChoice): void {
    this.theme.set(choice);
    try {
      localStorage.setItem('amelu-theme', choice);
    } catch {
      // Private mode: the choice simply doesn't stick.
    }
    const dark =
      choice === 'dark' ||
      (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }

  protected async createFolder(): Promise<void> {
    const name = this.newFolder()?.trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    this.folderError.set(null);
    try {
      await this.folders.create(name);
      this.newFolder.set(null);
    } catch (err) {
      this.folderError.set(errorMessage(err, 'Could not create the folder'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async renameFolder(): Promise<void> {
    const renaming = this.renaming();
    const name = renaming?.name.trim();
    if (!renaming || !name || this.busy()) return;
    this.busy.set(true);
    this.folderError.set(null);
    try {
      await this.folders.rename(renaming.id, name);
      this.renaming.set(null);
    } catch (err) {
      this.folderError.set(errorMessage(err, 'Could not rename the folder'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteFolder(folder: Folder): Promise<void> {
    if (this.busy()) return;
    if (!confirm(`Delete the folder "${folder.name}"? Its messages move to Trash.`)) return;
    this.busy.set(true);
    this.folderError.set(null);
    try {
      await this.folders.remove(folder.id);
      if (this.url().includes(`/folder/${folder.id}`)) await this.router.navigateByUrl('/');
    } catch (err) {
      this.folderError.set(errorMessage(err, 'Could not delete the folder'));
    } finally {
      this.busy.set(false);
    }
  }

  protected updateRenaming(name: string): void {
    const renaming = this.renaming();
    if (renaming) this.renaming.set({ ...renaming, name });
  }
}

function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem('amelu-theme');
    if (value === 'light' || value === 'system') return value;
  } catch {
    // ignore
  }
  return 'dark';
}
