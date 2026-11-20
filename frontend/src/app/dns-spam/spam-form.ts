import { DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { errorMessage } from '../api';
import { Crumb } from '../page-header/page-header';
import { injectDomain } from '../domain-context';

/** Breadcrumb for every Spam filtering page: its pages are tabs, so it ends at the section. */
export function spamCrumbs(ctx: ReturnType<typeof injectDomain>) {
  return computed<Crumb[]>(() => [
    { label: 'Domains', link: '/domains' },
    { label: ctx.domain()?.name ?? '', link: '/domains/' + ctx.id() },
    { label: 'Spam filtering' },
  ]);
}

/**
 * A spam settings form: loads the saved value for the domain in the route
 * into an editable draft, and saves the draft back.
 */
export function injectSpamForm<T>(options: {
  load: (domainId: string) => Observable<T>;
  save: (domainId: string, value: T) => Observable<T>;
  saveError: string;
}) {
  const ctx = injectDomain();
  // undefined while loading, null when it failed
  const saved = signal<T | null | undefined>(undefined);
  const draft = signal<T | undefined>(undefined);
  const saving = signal(false);
  const error = signal<string | null>(null);
  const success = signal(false);

  let sub: Subscription | undefined;
  inject(DestroyRef).onDestroy(() => sub?.unsubscribe());

  effect(() => {
    const id = ctx.id();
    untracked(() => {
      sub?.unsubscribe();
      saved.set(undefined);
      draft.set(undefined);
      error.set(null);
      success.set(false);
      sub = options.load(id).subscribe({
        next: (value) => {
          saved.set(value);
          draft.set(value);
        },
        error: () => saved.set(null),
      });
    });
  });

  const dirty = computed(() => {
    const value = draft();
    return value !== undefined && JSON.stringify(value) !== JSON.stringify(saved());
  });

  function update(patch: Partial<T>) {
    draft.update((value) => (value === undefined ? value : { ...value, ...patch }));
    success.set(false);
  }

  function submit(event: Event) {
    event.preventDefault();
    const value = draft();
    if (value === undefined || saving()) return;
    saving.set(true);
    error.set(null);
    success.set(false);
    options.save(ctx.id(), value).subscribe({
      next: (stored) => {
        saved.set(stored);
        draft.set(stored);
        success.set(true);
        saving.set(false);
      },
      error: (err) => {
        error.set(errorMessage(err, options.saveError));
        saving.set(false);
      },
    });
  }

  return { ...ctx, saved: saved.asReadonly(), draft: draft.asReadonly(), saving: saving.asReadonly(), error, success, dirty, update, submit };
}
