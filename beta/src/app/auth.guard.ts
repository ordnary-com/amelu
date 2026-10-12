import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Session } from './session';
import { legacyUrl } from './config';

// Signing in happens in the current dashboard (Ordnary login); without a
// session this app sends you there.
export const authGuard: CanActivateFn = async () => {
  if (await inject(Session).load()) return true;
  window.location.href = legacyUrl('/login');
  return false;
};
