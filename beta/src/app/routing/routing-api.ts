import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CatchAll, DomainAlias } from '../api';

export interface PatternRewrite {
  id: string;
  pattern: string;
  destination: string;
}

export interface BccCapture {
  id: string;
  pattern: string;
  capture: string;
}

export interface CreateAddressAliasResult {
  destination: string;
  error?: string;
}

export interface ImportAliasResult {
  alias: string;
  destination: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class RoutingApi {
  private readonly http = inject(HttpClient);

  // The API takes a list of destinations, but Stalwart lets an alias deliver to one mailbox only.
  createAddressAlias(domainId: string, localPart: string, destination: string) {
    return this.http.post<{ results: CreateAddressAliasResult[] }>(
      `/api/domains/${domainId}/address-aliases`,
      {
        localPart,
        destinations: [destination],
      },
    );
  }

  deleteAddressAlias(mailboxId: string, index: string) {
    return this.http.delete<{ ok: boolean }>(
      `/api/mailboxes/${mailboxId}/address-aliases/${index}`,
    );
  }

  // results is null when the CSV had no usable rows.
  importAddressAliases(domainId: string, csv: string) {
    return this.http.post<{ results: ImportAliasResult[] | null }>(
      `/api/domains/${domainId}/address-aliases/import`,
      { csv },
    );
  }

  createDomainAlias(domainId: string, name: string) {
    return this.http.post<DomainAlias>(`/api/domains/${domainId}/aliases`, { name });
  }

  deleteDomainAlias(domainId: string, name: string) {
    return this.http.delete<{ ok: boolean }>(
      `/api/domains/${domainId}/aliases/${encodeURIComponent(name)}`,
    );
  }

  updateCatchAll(domainId: string, address: string) {
    return this.http.put<CatchAll>(`/api/domains/${domainId}/catchall`, { address });
  }

  listPatternRewrites(domainId: string) {
    return this.http.get<PatternRewrite[]>(`/api/domains/${domainId}/rewrites`);
  }

  createPatternRewrite(domainId: string, pattern: string, destination: string) {
    return this.http.post<PatternRewrite>(`/api/domains/${domainId}/rewrites`, {
      pattern,
      destination,
    });
  }

  deletePatternRewrite(domainId: string, ruleId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/domains/${domainId}/rewrites/${ruleId}`);
  }

  listBccCaptures(domainId: string) {
    return this.http.get<BccCapture[]>(`/api/domains/${domainId}/bccs`);
  }

  createBccCapture(domainId: string, pattern: string, capture: string) {
    return this.http.post<BccCapture>(`/api/domains/${domainId}/bccs`, { pattern, capture });
  }

  deleteBccCapture(domainId: string, ruleId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/domains/${domainId}/bccs/${ruleId}`);
  }
}
