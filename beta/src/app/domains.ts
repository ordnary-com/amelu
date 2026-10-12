import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, of, switchMap } from 'rxjs';
import { Api } from './api';

/** The customer's domains, fetched once and shared by the sidebar and pages. */
@Injectable({ providedIn: 'root' })
export class Domains {
  private readonly api = inject(Api);
  private readonly reload$ = new BehaviorSubject<void>(undefined);

  // undefined while loading, null when the request failed. A reload keeps the
  // old list on screen until the new one arrives, so the sidebar doesn't blink.
  readonly list = toSignal(this.reload$.pipe(switchMap(() => this.api.listDomains().pipe(catchError(() => of(null))))));

  reload(): void {
    this.reload$.next();
  }
}
