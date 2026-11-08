import { Injectable, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, forkJoin, map, of, switchMap } from 'rxjs';
import { Api, DnsRecordCheck, Domain } from './api';
import { Domains } from './domains';

// null: the DNS check has no record of that kind to compare against, so
// there's nothing to call verified or broken. That's the case for DKIM on
// every domain right now, since GET /api/domains/{id}/dns returns no
// _domainkey records; showing it red would flag every domain as broken.
export type Check = boolean | null;

export interface DomainHealth {
  mx: Check;
  spf: Check;
  dkim: Check;
  dmarc: Check;
  /** Records that check out, of all the records the domain needs; total 0 when unknown. */
  matched: number;
  total: number;
}

/** Same derivation as the current dashboard's Domains page. */
export function deriveHealth(records: DnsRecordCheck[]): DomainHealth {
  // Unchecked records (no live lookup for that type) count neither way.
  const checked = records.filter((r) => r.status !== 'unchecked');
  return {
    mx: check(records.filter((r) => r.type === 'MX')),
    spf: check(records.filter((r) => r.type === 'TXT' && r.expected.includes('v=spf1'))),
    dkim: check(records.filter((r) => r.type === 'TXT' && r.name.includes('_domainkey'))),
    dmarc: check(records.filter((r) => r.type === 'TXT' && r.name.startsWith('_dmarc.'))),
    matched: checked.filter((r) => r.status === 'matched').length,
    total: checked.length,
  };
}

/** 0 to 100, or null when nothing could be checked. */
export function healthScore(health: DomainHealth | undefined): number | null {
  return health && health.total > 0 ? Math.round((health.matched / health.total) * 100) : null;
}

// A failed lookup says nothing about the records themselves.
export const UNKNOWN_HEALTH: DomainHealth = { mx: null, spf: null, dkim: null, dmarc: null, matched: 0, total: 0 };

function check(records: DnsRecordCheck[]): Check {
  return records.length === 0 ? null : records.some((r) => r.status === 'matched');
}

/** Not active yet, or a DNS record we could check is wrong. */
export function needsAttention(domain: Domain, health: DomainHealth | undefined): boolean {
  if (domain.status !== 'active') return true;
  return health !== undefined && (health.mx === false || health.spf === false || health.dkim === false || health.dmarc === false);
}

/** MX/SPF/DKIM per domain id, one DNS check per domain, shared across pages. */
@Injectable({ providedIn: 'root' })
export class DomainHealthChecks {
  private readonly api = inject(Api);

  // undefined until every domain's check has come back
  readonly byId = toSignal(
    toObservable(inject(Domains).list).pipe(
      filter((list): list is Domain[] => !!list),
      switchMap((list) =>
        list.length === 0
          ? of({} as Record<string, DomainHealth>)
          : forkJoin(
              Object.fromEntries(
                list.map((domain) => [
                  domain.id,
                  this.api.domainDns(domain.id).pipe(
                    map(({ records }) => deriveHealth(records)),
                    catchError(() => of(UNKNOWN_HEALTH)),
                  ),
                ]),
              ),
            ),
      ),
    ),
  );
}
