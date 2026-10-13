import { isDevMode } from '@angular/core';

/**
 * The current React dashboard. Pages that haven't been rebuilt in this app
 * link to it.
 */
export const LEGACY_ORIGIN = isDevMode() ? 'http://localhost:5173' : 'https://app.amelu.org';

export function legacyUrl(path: string): string {
  return LEGACY_ORIGIN + path;
}

/**
 * The Go API. In development `ng serve` proxies /api to it (proxy.conf.json),
 * so it's the same origin; in production it's its own host.
 */
export const API_ORIGIN = isDevMode() ? '' : 'https://api.amelu.org';

/** A full URL for an /api/... path, for plain links such as CSV downloads. */
export function apiUrl(path: string): string {
  return API_ORIGIN + path;
}

/**
 * Starts the Ordnary sign-in; the API sends the browser back here afterwards.
 * switchAccount shows Ordnary's sign-in form even when already signed in there.
 */
export function ordnaryLoginUrl(returnTo: string, switchAccount = false): string {
  const query = new URLSearchParams({ origin: window.location.origin, returnTo });
  if (switchAccount) query.set('switch', '1');
  return `${API_ORIGIN}/api/auth/ordnary/login?${query}`;
}

/** Where people manage their Ordnary account (name, photo, email, security). */
export const ORDNARY_ACCOUNT_URL = 'https://accounts.ordnary.com';
