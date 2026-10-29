import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { Api, Customer } from './api';

// Per browser tab: set when this tab leaves for Ordnary's sign-in, so the
// callback's landing shows "we found your account" once; cleared when the
// person continues. With a session and no pending sign-in, the dashboard
// just opens, in every tab, until the session expires.
const PENDING_KEY = 'amelu.login-pending';

const SLOW_AFTER_MS = 6_000;
const ATTEMPT_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const UNREACHABLE_POLL_MS = 15_000;

/**
 * 'slow' once the session check runs long (usually the API waking up),
 * 'unreachable' once retries ran out; checks keep going in the background.
 */
export type Connection = 'ok' | 'slow' | 'unreachable';

/** The signed-in customer, loaded once per page load from GET /api/me. */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly api = inject(Api);
  readonly customer = signal<Customer | null>(null);
  readonly connection = signal<Connection>('ok');
  private pending: Promise<boolean> | null = null;
  private wake: (() => void) | null = null;

  /** Shared between the guard and the sign-in page, so one check runs at a time. */
  load(): Promise<boolean> {
    if (this.customer()) return Promise.resolve(true);
    this.pending ??= this.check().finally(() => (this.pending = null));
    return this.pending;
  }

  /** Skips the wait before the next attempt. */
  retry(): void {
    this.connection.set('slow');
    this.wake?.();
  }

  // Only a 4xx means signed out. A timeout, network error (status 0) or 5xx
  // is the API starting up or down; treating those as signed out sent
  // people with a valid session to the sign-in page.
  private async check(): Promise<boolean> {
    const slow = setTimeout(() => this.connection.update((c) => (c === 'ok' ? 'slow' : c)), SLOW_AFTER_MS);
    try {
      for (let i = 0; ; i++) {
        try {
          this.customer.set(await firstValueFrom(this.api.me().pipe(timeout(ATTEMPT_TIMEOUT_MS))));
          return true;
        } catch (err) {
          if (err instanceof HttpErrorResponse && err.status >= 400 && err.status < 500) return false;
          if (i >= RETRY_DELAYS_MS.length) this.connection.set('unreachable');
          await this.pause(RETRY_DELAYS_MS[i] ?? UNREACHABLE_POLL_MS);
        }
      }
    } finally {
      clearTimeout(slow);
      this.connection.set('ok');
    }
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wake = done;
    });
  }

  /** Whether this tab is on its way back from Ordnary's sign-in. */
  loginPending(): boolean {
    return storage()?.getItem(PENDING_KEY) === '1';
  }

  markLoginPending(): void {
    storage()?.setItem(PENDING_KEY, '1');
  }

  clearLoginPending(): void {
    storage()?.removeItem(PENDING_KEY);
  }

  /** Ends the Amelu session without leaving the page. */
  async signOut(): Promise<void> {
    await firstValueFrom(this.api.logout()).catch(() => undefined);
    this.customer.set(null);
    this.clearLoginPending();
  }

  async logout(): Promise<void> {
    await this.signOut();
    window.location.href = '/login';
  }
}

// sessionStorage can throw (blocked storage, some private modes); without it
// the confirmation step after signing in is simply skipped.
function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
