import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { PageHeader } from '../page-header/page-header';
import { Icon } from '../icon';
import { UI } from '../ui';

type Pool = 'system' | 'trusted' | 'newdomains' | 'spare' | 'warming';

type Network = 'own' | 'current';

interface SendingIp {
  name: string;
  ip: string;
  pool: Pool;
  network: Network;
  /** Not sending yet: warm-up still to come. */
  pending?: boolean;
}

// Keep in sync with GROUPS and SPARES in ops/marduk/amelu-ip-pools.py.
const CURRENT_IPS: SendingIp[] = [
  { name: 'out2.mx.amelu.org', ip: '51.89.60.49', pool: 'system', network: 'current' },
  { name: 'out4.mx.amelu.org', ip: '51.89.39.34', pool: 'system', network: 'current' },
  { name: 'out1.mx.amelu.org', ip: '51.89.60.60', pool: 'trusted', network: 'current' },
  { name: 'out5.mx.amelu.org', ip: '51.89.2.193', pool: 'trusted', network: 'current' },
  { name: 'out8.mx.amelu.org', ip: '51.89.76.15', pool: 'trusted', network: 'current' },
  { name: 'out9.mx.amelu.org', ip: '51.89.85.197', pool: 'trusted', network: 'current' },
  { name: 'out3.mx.amelu.org', ip: '51.89.76.2', pool: 'newdomains', network: 'current' },
  { name: 'out6.mx.amelu.org', ip: '51.89.1.228', pool: 'newdomains', network: 'current' },
  { name: 'out7.mx.amelu.org', ip: '51.89.102.29', pool: 'newdomains', network: 'current' },
  { name: 'out10.mx.amelu.org', ip: '51.89.85.192', pool: 'newdomains', network: 'current' },
  { name: 'out11.mx.amelu.org', ip: '51.89.76.0', pool: 'spare', network: 'current' },
];

// Our own block 89.106.70.0/24 (AS218905), routed through rtr1-ams and
// rtr1-par. Listed early so customers can allowlist them; not sending yet.
// At most 64 of them on the page. One cluster name per /24 (mta0) and the
// last octet as the host, so out-10.mta0 is .10.
const OWN_BLOCK_IPS: SendingIp[] = Array.from({ length: 64 }, (_, i) => ({
  name: `out-${10 + i}.mta0.amelu.org`,
  ip: `89.106.70.${10 + i}`,
  pool: 'warming' as Pool,
  network: 'own' as Network,
  pending: true,
}));

const SENDING_IPS: SendingIp[] = [...CURRENT_IPS, ...OWN_BLOCK_IPS];

// provider: who runs the network the addresses are announced from (the ASN's holder).
const NETWORKS: { id: Network; label: string; cidr: string; asn: string; provider: string }[] = [
  { id: 'current', label: 'Current addresses', cidr: '51.89.0.0/16', asn: 'AS16276', provider: 'OVHcloud' },
  { id: 'own', label: 'Own network', cidr: '89.106.70.0/24', asn: 'AS218905', provider: 'Ordnary' },
];

const POOLS: { id: Pool; label: string; hint: string }[] = [
  { id: 'trusted', label: 'Customer mail', hint: 'Established customer domains' },
  { id: 'newdomains', label: 'New domains', hint: 'Recently added customer domains' },
  { id: 'system', label: 'Amelu notifications', hint: 'Account and billing email' },
  { id: 'spare', label: 'Reserve', hint: 'Ready to take over when needed' },
  { id: 'warming', label: 'Warming up', hint: 'Not sending yet' },
];

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
  protected readonly ips = SENDING_IPS;
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
    return this.ips.filter(
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
    return this.ips.filter((row) => (network === 'all' || row.network === network) && (pool === 'all' || row.pool === pool)).length;
  }

  protected networkCount(network: Network | 'all'): number {
    return network === 'all' ? this.ips.length : this.ips.filter((row) => row.network === network).length;
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
