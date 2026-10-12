import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MiscApi {
  private readonly http = inject(HttpClient);

  /** Session only: an API key can't reach this. Fails with 409 when the organization has other members. */
  terminateAccount(currentPassword: string) {
    return this.http.delete<{ ok: boolean }>('/api/account', { body: { currentPassword } });
  }
}
