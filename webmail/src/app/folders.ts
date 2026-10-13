import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, Folder, FolderRole } from './api';

const ROLE_ORDER: FolderRole[] = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash'];

/** The folder list, shared by the sidebar, the move picker and the list pane. */
@Injectable({ providedIn: 'root' })
export class Folders {
  private readonly api = inject(Api);
  // undefined while loading, null when it failed
  readonly folders = signal<Folder[] | undefined | null>(undefined);

  /** System folders in their usual order, then the person's own, by name. */
  readonly sorted = computed(() => {
    const list = this.folders() ?? [];
    return [...list].sort((a, b) => {
      const ra = a.role ? ROLE_ORDER.indexOf(a.role) : ROLE_ORDER.length;
      const rb = b.role ? ROLE_ORDER.indexOf(b.role) : ROLE_ORDER.length;
      if (ra !== rb) return ra - rb;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
  });

  byRole(role: FolderRole): Folder | undefined {
    return (this.folders() ?? []).find((folder) => folder.role === role);
  }

  byId(id: string): Folder | undefined {
    return (this.folders() ?? []).find((folder) => folder.id === id);
  }

  async load(): Promise<void> {
    try {
      this.folders.set((await firstValueFrom(this.api.listFolders())).folders);
    } catch {
      if (this.folders() === undefined) this.folders.set(null);
    }
  }

  async create(name: string): Promise<void> {
    await firstValueFrom(this.api.createFolder(name));
    await this.load();
  }

  async rename(id: string, name: string): Promise<void> {
    await firstValueFrom(this.api.renameFolder(id, name));
    await this.load();
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.api.deleteFolder(id));
    await this.load();
  }
}
