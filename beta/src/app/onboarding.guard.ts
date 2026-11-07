import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Session } from './session';

/** The owner of a new organization sees the welcome flow once, before the dashboard. */
export const onboardingGuard: CanActivateFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  if (!(await session.load())) return true;
  const customer = session.customer();
  return customer && !customer.onboarded && customer.role === 'owner' ? router.createUrlTree(['/welcome']) : true;
};
