import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Account, Api } from './api';

/** The signed-in mailbox, loaded once per page load from GET /api/webmail/me. */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly api = inject(Api);
  readonly account = signal<Account | null>(null);

  async load(): Promise<boolean> {
    if (this.account()) return true;
    try {
      this.account.set(await firstValueFrom(this.api.me()));
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.api.logout()).catch(() => undefined);
    this.account.set(null);
    window.location.href = '/login';
  }
}
