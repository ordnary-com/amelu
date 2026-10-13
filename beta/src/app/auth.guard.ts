import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Session } from './session';

// Without a session, or with one this tab hasn't confirmed yet, go to the
// sign-in page and come back here afterwards.
export const authGuard: CanActivateFn = async (_route, state) => {
  // inject() only works before the first await.
  const session = inject(Session);
  const router = inject(Router);
  if ((await session.load()) && session.confirmed()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnTo: state.url } });
};
