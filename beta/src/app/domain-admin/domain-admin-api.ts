import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { Domain } from '../api';

/** The fields of GET /api/domains that the shared Domain type leaves out. */
export interface DomainSettings extends Domain {
  notes: string;
  publiclyListed: boolean;
}

@Injectable({ providedIn: 'root' })
export class DomainAdminApi {
  private readonly http = inject(HttpClient);

  // There's no single-domain endpoint; the list carries notes and listing too.
  domainSettings(id: string) {
    return this.http
      .get<DomainSettings[]>('/api/domains')
      .pipe(map((domains) => domains.find((domain) => domain.id === id) ?? null));
  }

  updateNotes(id: string, notes: string) {
    return this.http.patch<{ notes: string }>(`/api/domains/${id}/notes`, { notes });
  }

  updateListing(id: string, publiclyListed: boolean) {
    return this.http.patch<{ publiclyListed: boolean }>(`/api/domains/${id}/listing`, { publiclyListed });
  }

  transfer(id: string, newOwnerEmail: string) {
    return this.http.post<{ ok: boolean }>(`/api/domains/${id}/transfer`, { newOwnerEmail });
  }

  deactivate(id: string) {
    return this.http.post<{ ok: boolean }>(`/api/domains/${id}/deactivate`, {});
  }

  reactivate(id: string) {
    return this.http.post<{ ok: boolean }>(`/api/domains/${id}/reactivate`, {});
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/domains/${id}`);
  }
}
