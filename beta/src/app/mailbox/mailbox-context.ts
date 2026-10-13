import { DestroyRef, Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { Mailbox } from '../api';
import { LoadErrors } from '../load-errors';
import { errorMessage } from '../api';
import { MailboxApi } from './mailbox-api';

// undefined while loading, null when the request failed
export type Loaded<T> = T | null | undefined;

/**
 * The mailbox the current /domains/:domainId/mailboxes/:mailboxId page is
 * about. Provided on MailboxLayout, so every page under it shares the one fetch and
 * sees a rename or suspend made on another one.
 */
@Injectable()
export class MailboxContext {
  private readonly api = inject(MailboxApi);

  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  readonly id = computed(() => this.params().get('mailboxId')!);
  readonly domainId = computed(() => this.params().get('domainId')!);
  /** /domains/<id>/mailboxes/<id>, for links between the mailbox's pages. */
  readonly base = computed(() => `/domains/${this.domainId()}/mailboxes/${this.id()}`);

  private readonly state = signal<Loaded<Mailbox>>(undefined);
  readonly mailbox = this.state.asReadonly();

  constructor() {
    toObservable(this.id)
      .pipe(
        switchMap((id) =>
          this.api.get(id).pipe(
            map((mailbox): Loaded<Mailbox> => mailbox),
            catchError(() => of(null)),
            startWith(undefined),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((mailbox) => this.state.set(mailbox));
  }

  /** After a change that returns the updated mailbox, or changes it some other way. */
  update(change: Mailbox | ((mailbox: Mailbox) => Mailbox)): void {
    const current = this.state();
    if (typeof change !== 'function') this.state.set(change);
    else if (current) this.state.set(change(current));
  }
}

/**
 * Loads something about the current mailbox, again whenever the route moves
 * to another mailbox. The result is writable so a save can put the server's
 * answer back in. Call it in a component's field initializers.
 */
export function perMailbox<T>(load: (id: string) => Observable<T>): WritableSignal<Loaded<T>> {
  const state = signal<Loaded<T>>(undefined);
  const errors = inject(LoadErrors);
  toObservable(inject(MailboxContext).id)
    .pipe(
      switchMap((id) =>
        load(id).pipe(
          map((value): Loaded<T> => value),
          catchError((err) => {
            errors.last.set(errorMessage(err, 'Could not load'));
            return of(null);
          }),
          startWith(undefined),
        ),
      ),
      takeUntilDestroyed(),
    )
    .subscribe((value) => state.set(value));
  return state;
}
