import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Api, SendingIpStatus } from '../api';
import { PageHeader } from '../page-header/page-header';
import { Icon } from '../icon';
import { UI } from '../ui';

type Pool = 'system' | 'trusted' | 'newdomains' | 'spare' | 'unassigned';

type Network = 'own' | 'current';

/** sending, paused and pending come from the mail server's report; unused means it isn't in any pool. */
type Status = 'sending' | 'paused' | 'pending' | 'standby' | 'unused';

interface SendingIp {
  name: string;
  ip: string;
  pool: Pool;
  network: Network;
}

interface Row extends SendingIp {
  status: Status;
}

// The addresses listed even before the mail server reports on them. Pools and
// status come from GET /api/sending/network (amelu-ip-pools on marduk).
// The OVH addresses (51.89.0.0/16) were retired on 2026-11-18, when the mail
// server moved and started sending only from our own block.
const CURRENT_IPS: SendingIp[] = [];

// Our own block 89.106.70.0/24 (AS218905), routed through rtr2-ams, rtr1-ams
// and rtr1-par. All 64 are listed so customers can allowlist them before they
// send. One cluster name per /24 (mta0) and the last octet as the host, so
// out-1.mta0 is .1.
const OWN_BLOCK_IPS: SendingIp[] = Array.from({ length: 64 }, (_, i) => ({
  name: `out-${i + 1}.mta0.amelu.org`,
  ip: `89.106.70.${i + 1}`,
  pool: 'unassigned' as Pool,
  network: 'own' as Network,
}));

const SENDING_IPS: SendingIp[] = [...CURRENT_IPS, ...OWN_BLOCK_IPS];

// provider: who runs the network the addresses are announced from (the ASN's holder).
const NETWORKS: { id: Network; label: string; cidr: string; asn: string; provider: string }[] = [
  { id: 'own', label: 'Own network', cidr: '89.106.70.0/24', asn: 'AS218905', provider: 'Ordnary' },
];

const POOLS: { id: Pool; label: string; hint: string }[] = [
  { id: 'trusted', label: 'Customer mail', hint: 'Established customer domains' },
  { id: 'newdomains', label: 'New domains', hint: 'Recently added customer domains' },
  { id: 'system', label: 'Amelu notifications', hint: 'Account and billing email' },
  { id: 'spare', label: 'Reserve', hint: 'Ready to take over when needed' },
  { id: 'unassigned', label: 'Not assigned', hint: 'Not in use yet' },
];

const STATE_STATUS: Record<SendingIpStatus['state'], Status> = {
  active: 'sending',
  paused: 'paused',
  pending: 'pending',
  spare: 'standby',
};

const isPool = (group: string): group is Pool => POOLS.some((p) => p.id === group);

/** The addresses our mail server sends from, grouped by the pool that uses them. */
@Component({
  selector: 'amelu-network-page',
  imports: [PageHeader, Icon],
  templateUrl: './network-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NetworkPage {
  protected readonly ui = UI;

  /** null until the report loads, or when it can't. */
  private readonly report = toSignal(
    inject(Api)
      .sendingNetwork()
      .pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  /** The listed addresses with the reported pool and status, plus any reported address not listed yet. */
  protected readonly ips = computed<Row[]>(() => {
    const reported = this.report()?.ips ?? [];
    if (!reported.length) {
      // No report yet: list the addresses without claiming a status.
      return SENDING_IPS.map((row) => ({ ...row, status: 'unused' }));
    }
    const byIp = new Map(reported.map((r) => [r.ip, r]));
    const rows: Row[] = SENDING_IPS.map((row) => {
      const r = byIp.get(row.ip);
      return r
        ? { ...row, pool: isPool(r.group) ? r.group : row.pool, status: STATE_STATUS[r.state] ?? 'pending' }
        : { ...row, pool: 'unassigned', status: 'unused' };
    });
    const listed = new Set(SENDING_IPS.map((row) => row.ip));
    for (const r of reported) {
      // Only our own block is listed; anything else would have no subnet row.
      if (listed.has(r.ip) || !r.ip.startsWith('89.106.70.')) continue;
      rows.push({
        name: r.name,
        ip: r.ip,
        pool: isPool(r.group) ? r.group : 'unassigned',
        network: 'own',
        status: STATE_STATUS[r.state] ?? 'pending',
      });
    }
    return rows;
  });
  protected readonly pools = POOLS;
  protected readonly networks = NETWORKS;
  protected readonly networkOf = Object.fromEntries(NETWORKS.map((n) => [n.id, n])) as Record<Network, (typeof NETWORKS)[number]>;
  /** Pools with addresses in the selected subnet (plus the selected one, so it can be cleared). */
  protected readonly visiblePools = computed(() =>
    POOLS.filter((p) => p.id === this.pool() || this.count(p.id) > 0),
  );
  protected readonly poolHint = Object.fromEntries(POOLS.map((p) => [p.id, p.hint])) as Record<Pool, string>;
  protected readonly poolLabel = Object.fromEntries(POOLS.map((p) => [p.id, p.label])) as Record<Pool, string>;

  protected readonly search = signal('');
  protected readonly pool = signal<Pool | 'all'>('all');
  protected readonly network = signal<Network | 'all'>('all');

  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const pool = this.pool();
    const network = this.network();
    return this.ips().filter(
      (row) =>
        (pool === 'all' || row.pool === pool) &&
        (network === 'all' || row.network === network) &&
        (!query || row.name.includes(query) || row.ip.includes(query)),
    );
  });

  protected readonly activePool = computed(() => POOLS.find((p) => p.id === this.pool()) ?? null);
  protected readonly activeNetwork = computed(() => NETWORKS.find((n) => n.id === this.network()) ?? null);
  protected readonly filtering = computed(
    () => this.pool() !== 'all' || this.network() !== 'all' || this.search().trim() !== '',
  );

  /** Addresses in a pool within the selected network, so the counts match the table. */
  protected count(pool: Pool | 'all'): number {
    const network = this.network();
    return this.ips().filter((row) => (network === 'all' || row.network === network) && (pool === 'all' || row.pool === pool)).length;
  }

  protected networkCount(network: Network | 'all'): number {
    return network === 'all' ? this.ips().length : this.ips().filter((row) => row.network === network).length;
  }

  protected clearFilters(): void {
    this.search.set('');
    this.pool.set('all');
    this.network.set('all');
  }

  /** The IP just copied, or 'list'; shows a check for a moment. */
  protected readonly copied = signal<string | null>(null);
  private reset?: ReturnType<typeof setTimeout>;

  protected async copy(what: string): Promise<void> {
    const text = what === 'list' ? this.filtered().map((row) => row.ip).join('\n') : what;
    await navigator.clipboard.writeText(text);
    this.copied.set(what);
    clearTimeout(this.reset);
    this.reset = setTimeout(() => this.copied.set(null), 1500);
  }
}
