import { isDevMode } from '@angular/core';

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

/** The public repository, linked from the beta notice on the home page. */
export const GITHUB_URL = 'https://github.com/ordnary-com/amelu';

/** Where people manage their Ordnary account (name, photo, email, security). */
export const ORDNARY_ACCOUNT_URL = 'https://accounts.ordnary.com';

/**
 * Invite to the Ordnary Discord server, linked from the home page. Empty
 * hides the link.
 */
export const DISCORD_URL = 'https://discord.gg/ordnary';
