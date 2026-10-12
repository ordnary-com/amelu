import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Mailbox } from '../api';

export interface EnabledServices {
  maySend: boolean;
  mayReceive: boolean;
  mayImap: boolean;
  mayPop3: boolean;
  maySieve: boolean;
}

export interface MailboxLimits {
  maxEmails: number;
  maxDiskQuotaBytes: number;
}

export interface ImportMailboxResult {
  address: string;
  password?: string;
  note?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class MailboxesApi {
  private readonly http = inject(HttpClient);

  // An empty password makes the API generate one; either way the response carries the password that was set.
  createMailbox(domainId: string, body: { localPart: string; displayName: string; password: string }) {
    return this.http.post<Mailbox>(`/api/domains/${domainId}/mailboxes`, body);
  }

  deleteMailbox(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/mailboxes/${id}`);
  }

  importCsv(domainId: string, csv: string) {
    return this.http.post<{ results: ImportMailboxResult[] | null }>(`/api/domains/${domainId}/mailboxes/import`, { csv });
  }

  defaultServices(domainId: string) {
    return this.http.get<EnabledServices>(`/api/domains/${domainId}/mailboxes/default-services`);
  }

  updateDefaultServices(domainId: string, services: EnabledServices) {
    return this.http.put<EnabledServices>(`/api/domains/${domainId}/mailboxes/default-services`, services);
  }

  defaultLimits(domainId: string) {
    return this.http.get<MailboxLimits>(`/api/domains/${domainId}/mailboxes/default-limits`);
  }

  updateDefaultLimits(domainId: string, limits: MailboxLimits) {
    return this.http.put<MailboxLimits>(`/api/domains/${domainId}/mailboxes/default-limits`, limits);
  }
}
