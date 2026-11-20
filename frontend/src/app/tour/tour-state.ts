import { Injectable, signal } from '@angular/core';

// Per browser, per customer: the tour is a one-time welcome, not account data.
const DONE = (customerId: string) => `amelu.tour.done.${customerId}`;
const PENDING = 'amelu.tour.pending';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the tour just shows again next time.
  }
}

/** The first-time tour: queued by onboarding, started on the Overview, or by hand from the account menu. */
@Injectable({ providedIn: 'root' })
export class TourState {
  readonly active = signal(false);
  /** Bumped on every start, so the tour begins at step one again. */
  readonly runs = signal(0);

  /** Onboarding calls this; the shell starts the tour once the customer reaches the Overview. */
  queue(customerId: string): void {
    write(PENDING, customerId);
  }

  isQueued(customerId: string): boolean {
    return read(PENDING) === customerId && read(DONE(customerId)) === null;
  }

  start(): void {
    this.runs.update((n) => n + 1);
    this.active.set(true);
  }

  finish(customerId: string | undefined): void {
    this.active.set(false);
    write(PENDING, null);
    if (customerId) write(DONE(customerId), new Date().toISOString());
  }
}
