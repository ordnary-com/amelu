import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { PageHeader } from '../page-header/page-header';
import { Icon } from '../icon';
import { UI } from '../ui';

// Keep in sync with GROUPS and SPARES in ops/marduk/amelu-ip-pools.py.
const SENDING_IPS = [
  { name: 'out1.mx.amelu.org', ip: '51.89.60.60' },
  { name: 'out2.mx.amelu.org', ip: '51.89.60.49' },
  { name: 'out3.mx.amelu.org', ip: '51.89.76.2' },
  { name: 'out4.mx.amelu.org', ip: '51.89.39.34' },
  { name: 'out5.mx.amelu.org', ip: '51.89.2.193' },
  { name: 'out6.mx.amelu.org', ip: '51.89.1.228' },
  { name: 'out7.mx.amelu.org', ip: '51.89.102.29' },
  { name: 'out8.mx.amelu.org', ip: '51.89.76.15' },
  { name: 'out9.mx.amelu.org', ip: '51.89.85.197' },
  { name: 'out10.mx.amelu.org', ip: '51.89.85.192' },
  { name: 'out11.mx.amelu.org', ip: '51.89.76.0' },
];

/** The addresses our mail server sends from. */
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
  /** The IP just copied, or 'all'; shows a check for a moment. */
  protected readonly copied = signal<string | null>(null);
  private reset?: ReturnType<typeof setTimeout>;

  protected async copy(what: string): Promise<void> {
    const text = what === 'all' ? this.ips.map((row) => row.ip).join('\n') : what;
    await navigator.clipboard.writeText(text);
    this.copied.set(what);
    clearTimeout(this.reset);
    this.reset = setTimeout(() => this.copied.set(null), 1500);
  }
}
