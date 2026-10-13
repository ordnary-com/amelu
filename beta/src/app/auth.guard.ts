import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Session } from './session';

// Without a session go to the sign-in page and come back here afterwards.
// Straight after Ordnary's callback (this tab left for the sign-in) the
// sign-in page first shows the account that was found.
export const authGuard: CanActivateFn = async (_route, state) => {
  // inject() only works before the first await.
  const session = inject(Session);
  const router = inject(Router);
  if ((await session.load()) && !session.loginPending()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnTo: state.url } });
};
