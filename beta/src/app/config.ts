import { isDevMode } from '@angular/core';

/**
 * The current React dashboard. Login (through Ordnary) still lives there, and
 * pages that haven't been rebuilt in this app link to it.
 */
export const LEGACY_ORIGIN = isDevMode() ? 'http://localhost:5173' : 'https://app.amelu.org';

export function legacyUrl(path: string): string {
  return LEGACY_ORIGIN + path;
}

/** Where people manage their Ordnary account (name, photo, email, security). */
export const ORDNARY_ACCOUNT_URL = 'https://accounts.ordnary.com';
