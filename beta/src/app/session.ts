import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, Customer } from './api';

// Per browser tab: set when this tab leaves for Ordnary's sign-in, so the
// callback's landing shows "we found your account" once; cleared when the
// person continues. With a session and no pending sign-in, the dashboard
// just opens, in every tab, until the session expires.
const PENDING_KEY = 'amelu.login-pending';

/** The signed-in customer, loaded once per page load from GET /api/me. */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly api = inject(Api);
  readonly customer = signal<Customer | null>(null);

  async load(): Promise<boolean> {
    if (this.customer()) return true;
    try {
      this.customer.set(await firstValueFrom(this.api.me()));
      return true;
    } catch {
      return false;
    }
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
