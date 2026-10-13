import { isDevMode } from '@angular/core';

/**
 * The Go API. In development `ng serve` proxies /api to it (proxy.conf.json),
 * so it's the same origin; in production it's its own host.
 */
export const API_ORIGIN = isDevMode() ? '' : 'https://api.amelu.org';

/** A full URL for an /api/... path, for plain links such as attachment downloads. */
export function apiUrl(path: string): string {
  return API_ORIGIN + path;
}
