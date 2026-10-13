import { Injectable, signal } from '@angular/core';

/**
 * The message of the most recent failed load, so an error empty-state can
 * say what actually went wrong (the API's sentence with its code and
 * request id) instead of only "couldn't be loaded". Cleared when a new
 * load starts.
 */
@Injectable({ providedIn: 'root' })
export class LoadErrors {
  readonly last = signal<string | null>(null);
  /** The API's error code of that failure, e.g. MAIL_CLUSTER_NOT_FOUND. */
  readonly code = signal<string | null>(null);

  set(message: string | null, code: string | null = null): void {
    this.last.set(message);
    this.code.set(code);
  }
}
