import { computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { Domains } from './domains';

/**
 * The domain the current route is under (/domains/:domainId/...). Call it in a
 * component's field initializers. The router inherits params from parents
 * (app.config.ts), so this works at any depth below the domain.
 *
 * domain() is undefined while the list loads, null when it failed or the id
 * isn't one of this organization's domains.
 */
export function injectDomain() {
  const route = inject(ActivatedRoute);
  const list = inject(Domains).list;
  const id = toSignal(route.paramMap.pipe(map((params) => params.get('domainId')!)), { requireSync: true });
  const domain = computed(() => {
    const domains = list();
    if (domains === undefined) return undefined;
    return domains?.find((d) => d.id === id()) ?? null;
  });
  return { id, domain };
}
