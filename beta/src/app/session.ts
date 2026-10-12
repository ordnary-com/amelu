import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, Customer } from './api';
import { legacyUrl } from './config';

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

  async logout(): Promise<void> {
    await firstValueFrom(this.api.logout()).catch(() => undefined);
    window.location.href = legacyUrl('/login');
  }
}
