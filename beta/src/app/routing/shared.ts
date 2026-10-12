import { ChangeDetectionStrategy, Component, Signal, input, model, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { Mailbox } from '../api';
import { UI } from '../ui';

// undefined while loading, null when the request failed
export type Loaded<T> = T | null | undefined;

/**
 * Loads per domain and refetches when the route moves to another domain.
 * reload() keeps the current value on screen until the new one arrives, so a
 * list doesn't flash its skeleton after a delete.
 */
export function domainResource<T>(id: Signal<string>, load: (id: string) => Observable<T>) {
  const reload$ = new Subject<void>();
  const value = toSignal(
    toObservable(id).pipe(
      switchMap((domainId) =>
        reload$.pipe(
          startWith(undefined),
          switchMap((_, i) => {
            const request = load(domainId).pipe(
              map((loaded): Loaded<T> => loaded),
              catchError(() => of(null)),
            );
            return i === 0 ? request.pipe(startWith(undefined)) : request;
          }),
        ),
      ),
    ),
    { initialValue: undefined as Loaded<T> },
  );
  return { value, reload: () => reload$.next() };
}

/** The local part of whatever was typed: aliases can't point to other domains. */
export function localPart(value: string): string {
  return value.trim().toLowerCase().split('@')[0];
}

/** Confirmation modal for a delete. The explanation goes in as content. */
@Component({
  selector: 'amelu-confirm-delete',
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      (click)="close()"
    >
      <div
        class="w-full max-w-md rounded-lg border border-line bg-popover p-5 shadow-xl"
        role="alertdialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
      >
        <h3 class="text-[15px] font-bold break-words">{{ title() }}</h3>
        <p class="mt-2 text-[13px] leading-relaxed text-muted"><ng-content /></p>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" [class]="ui.outline" (click)="close()" [disabled]="busy()">
            Cancel
          </button>
          <button type="button" [class]="ui.danger" (click)="confirmed.emit()" [disabled]="busy()">
            {{ busy() ? 'Deleting...' : 'Yes, delete it' }}
          </button>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class ConfirmDelete {
  protected readonly ui = UI;
  readonly title = input.required<string>();
  readonly busy = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected close(): void {
    if (!this.busy()) this.cancelled.emit();
  }
}

/** Skeleton rows for a list card. */
@Component({
  selector: 'amelu-list-skeleton',
  template: `
    @for (i of [1, 2, 3]; track i) {
      <div class="space-y-2 border-b border-line px-4 py-3 last:border-b-0" aria-hidden="true">
        <span class="block h-3 w-48 animate-pulse rounded bg-bg"></span>
        <span class="block h-3 w-32 animate-pulse rounded bg-bg"></span>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ListSkeleton {}

/**
 * Picks a destination mailbox on this domain by local part. Falls back to a
 * plain text field when the mailbox list couldn't be loaded.
 */
@Component({
  selector: 'amelu-mailbox-field',
  imports: [RouterLink],
  template: `
    <label [for]="fieldId()" [class]="ui.label">{{ label() }}</label>
    @if (mailboxes() === undefined) {
      <span
        class="mt-1.5 block h-9 w-full animate-pulse rounded-md bg-bg"
        aria-hidden="true"
      ></span>
    } @else if (mailboxes(); as list) {
      @if (list.length) {
        <select
          [id]="fieldId()"
          [class]="ui.input + ' cursor-pointer'"
          required
          [value]="value()"
          (change)="value.set($any($event.target).value)"
        >
          <option value="" disabled>Choose a mailbox</option>
          @for (mailbox of list; track mailbox.id) {
            <option [value]="mailbox.localPart" [selected]="mailbox.localPart === value()">
              {{ mailbox.address }}{{ mailbox.displayName ? ' (' + mailbox.displayName + ')' : '' }}
            </option>
          }
        </select>
      } @else {
        <p class="mt-1.5 rounded-md bg-bg px-3 py-2 text-[13px] text-muted">
          There are no mailboxes on this domain yet.
          <a
            [routerLink]="'/domains/' + domainId() + '/mailboxes/new'"
            class="font-medium text-link hover:underline"
            >Create one first</a
          >.
        </p>
      }
    } @else {
      <div
        class="mt-1.5 flex h-9 items-center rounded-md border border-line focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
      >
        <input
          [id]="fieldId()"
          class="h-full w-full min-w-0 bg-transparent px-2.5 text-[13px] outline-none placeholder:text-muted"
          placeholder="eg. mailbox"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          required
          [value]="value()"
          (input)="value.set($any($event.target).value)"
        />
        <span
          class="flex h-full items-center border-l border-line px-2.5 text-[13px] text-muted select-none"
          >&#64;{{ domainName() }}</span
        >
      </div>
      <p [class]="ui.hint">
        The mailbox list couldn't be loaded, so type the mailbox's local part.
      </p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxField {
  protected readonly ui = UI;
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly mailboxes = input.required<Loaded<Mailbox[]>>();
  readonly domainId = input.required<string>();
  readonly domainName = input('');
  readonly value = model('');
}
