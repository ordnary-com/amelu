import { DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subscription, catchError, map, of, startWith, switchMap } from 'rxjs';
import { Api, DnsRecordCheck, errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { Domains } from '../domains';
import { deriveHealth } from '../domain-health';
import { Tone } from '../status';
import { DnsSpamApi } from './dns-spam-api';

export const RECORD_STATUS: Record<DnsRecordCheck['status'], { label: string; tone: Tone }> = {
  matched: { label: 'Verified', tone: 'ok' },
  mismatch: { label: 'Wrong value', tone: 'bad' },
  missing: { label: 'Missing', tone: 'bad' },
  unchecked: { label: 'Not checked', tone: 'neutral' },
};

/**
 * The live DNS check for the domain in the route, plus Domain Connect. A
 * recheck keeps the last result on screen until the new one arrives.
 */
export function injectDnsCheck() {
  const api = inject(Api);
  const dnsApi = inject(DnsSpamApi);
  const domains = inject(Domains);
  const ctx = injectDomain();

  // undefined while the first check runs, null when it failed
  const records = signal<DnsRecordCheck[] | null | undefined>(undefined);
  const checking = signal(false);
  const error = signal<string | null>(null);
  const checkedAt = signal<Date | null>(null);

  let sub: Subscription | undefined;
  inject(DestroyRef).onDestroy(() => sub?.unsubscribe());

  function run(id: string) {
    sub?.unsubscribe();
    checking.set(true);
    error.set(null);
    sub = api.domainDns(id).subscribe({
      next: ({ records: list }) => {
        records.set(list);
        checkedAt.set(new Date());
        checking.set(false);
        // The API flips the domain between active and dns_pending as part of
        // this check, so the sidebar and badges need the new status.
        const domain = ctx.domain();
        if (domain && allCheckedMatch(list) !== (domain.status === 'active')) domains.reload();
      },
      error: (err) => {
        error.set(errorMessage(err, 'The DNS records could not be checked.'));
        if (records() === undefined) records.set(null);
        checking.set(false);
      },
    });
  }

  effect(() => {
    const id = ctx.id();
    untracked(() => {
      records.set(undefined);
      checkedAt.set(null);
      run(id);
    });
  });

  // null when unsupported or the lookup failed: the manual route always works.
  const applyUrl = toSignal(
    toObservable(ctx.id).pipe(
      switchMap((id) =>
        dnsApi.domainConnect(id).pipe(
          map((status) => (status.supported && status.applyUrl ? status.applyUrl : null)),
          catchError(() => of(null)),
          startWith(null),
        ),
      ),
    ),
    { initialValue: null },
  );

  const summary = computed(() => {
    const list = records();
    if (!list) return null;
    const count = (status: DnsRecordCheck['status']) => list.filter((r) => r.status === status).length;
    const matched = count('matched');
    return {
      total: list.length,
      matched,
      mismatch: count('mismatch'),
      missing: count('missing'),
      unchecked: count('unchecked'),
      allMatched: list.length > 0 && matched === list.length,
      health: deriveHealth(list),
    };
  });

  return {
    ...ctx,
    records: records.asReadonly(),
    checking: checking.asReadonly(),
    error,
    checkedAt: checkedAt.asReadonly(),
    applyUrl,
    summary,
    bindUrl: computed(() => dnsApi.bindFileUrl(ctx.id())),
    recheck: () => run(ctx.id()),
  };
}

// Mirrors dnscheck.AllCheckedMatch on the API, which decides the domain's status.
function allCheckedMatch(records: DnsRecordCheck[]): boolean {
  const checked = records.filter((r) => r.status !== 'unchecked');
  return checked.length > 0 && checked.every((r) => r.status === 'matched');
}

/** The host as most DNS providers want it: relative to the domain, "@" for the domain itself. */
export function relativeHost(name: string, domain: string): string {
  const host = name.replace(/\.$/, '').toLowerCase();
  const zone = domain.replace(/\.$/, '').toLowerCase();
  if (host === zone) return '@';
  return host.endsWith('.' + zone) ? host.slice(0, -(zone.length + 1)) : host;
}
