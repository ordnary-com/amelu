import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, firstValueFrom, of, switchMap, tap } from 'rxjs';
import { Api, Domain } from './api';

/** The customer's domains, fetched once and shared by the sidebar and pages. */
@Injectable({ providedIn: 'root' })
export class Domains {
  private readonly api = inject(Api);
  private readonly reload$ = new BehaviorSubject<void>(undefined);

  // Local edits (stars, drag-and-drop) on top of the last fetched list, so the
  // screen updates at once instead of after the round trip.
  private readonly local = signal<Domain[] | null>(null);

  // undefined while loading, null when the request failed. A reload keeps the
  // old list on screen until the new one arrives, so the sidebar doesn't blink.
  private readonly fetched = toSignal(
    this.reload$.pipe(
      switchMap(() => this.api.listDomains().pipe(catchError(() => of(null)))),
      tap(() => this.local.set(null)),
    ),
  );

  readonly list = computed(() => this.local() ?? this.fetched());

  /** Favorites first, then the customer's own order, then newest first. */
  readonly arranged = computed(() => {
    const list = this.list();
    return list ? arrange(list) : list;
  });

  reload(): void {
    this.reload$.next();
  }

  async setFavorite(domain: Domain, favorite: boolean): Promise<void> {
    this.patch((list) => list.map((d) => (d.id === domain.id ? { ...d, favorite } : d)));
    try {
      await firstValueFrom(this.api.setDomainFavorite(domain.id, favorite));
    } catch {
      this.reload();
      throw new Error('Your favorite could not be saved.');
    }
  }

  /** Saves ids, first to last, as the custom order. */
  async setOrder(ids: string[]): Promise<void> {
    const position = new Map(ids.map((id, i) => [id, i]));
    this.patch((list) => list.map((d) => (position.has(d.id) ? { ...d, position: position.get(d.id) } : d)));
    try {
      await firstValueFrom(this.api.setDomainOrder(ids));
    } catch {
      this.reload();
      throw new Error('The new order could not be saved.');
    }
  }

  private patch(change: (list: Domain[]) => Domain[]): void {
    const list = this.list();
    if (list) this.local.set(change(list));
  }
}

function arrange(list: Domain[]): Domain[] {
  return [...list].sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) ||
      (a.position ?? Infinity) - (b.position ?? Infinity) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
