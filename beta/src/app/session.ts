import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, Customer } from './api';

// Per browser tab: set once the person has said "yes, that's me" on the
// sign-in page, so they're asked once per tab, also right after signing in.
const CONFIRMED_KEY = 'amelu.account-confirmed';

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

  /** Whether this tab already confirmed the account it's signed in with. */
  confirmed(): boolean {
    return storage()?.getItem(CONFIRMED_KEY) === this.customer()?.id;
  }

  confirm(): void {
    const id = this.customer()?.id;
    if (id) storage()?.setItem(CONFIRMED_KEY, id);
  }

  /** Ends the Amelu session without leaving the page. */
  async signOut(): Promise<void> {
    await firstValueFrom(this.api.logout()).catch(() => undefined);
    this.customer.set(null);
    storage()?.removeItem(CONFIRMED_KEY);
  }

  async logout(): Promise<void> {
    await this.signOut();
    window.location.href = '/login';
  }
}

// sessionStorage can throw (blocked storage, some private modes); without it
// the account is simply asked about on every visit.
function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
