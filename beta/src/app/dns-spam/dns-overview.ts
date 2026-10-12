import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { injectDnsCheck } from './dns-check';
import { DnsRecord } from './dns-record';

/**
 * Where a new domain lands: what still has to be set at the DNS provider,
 * with a live check. Replaces frontend/src/pages/DnsOverviewPage.tsx.
 */
@Component({
  selector: 'amelu-dns-overview',
  imports: [Alert, DatePipe, DnsRecord, EmptyState, PageHeader, RouterLink],
  templateUrl: './dns-overview.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DnsOverview {
  protected readonly ui = UI;
  protected readonly dns = injectDnsCheck();

  protected readonly crumbs = computed(() => [
    { label: 'Email Domains', link: '/domains' },
    { label: this.dns.domain()?.name ?? '', link: '/domains/' + this.dns.id() },
    { label: 'DNS' },
  ]);

  protected readonly todo = computed(() => this.dns.records()?.filter((r) => r.status !== 'matched'));

  protected readonly health = computed(() => {
    const health = this.dns.summary()?.health;
    if (!health) return undefined;
    return [
      { label: 'MX', what: 'Receives mail', ok: health.mx },
      { label: 'SPF', what: 'Allowed to send', ok: health.spf },
      { label: 'DKIM', what: 'Signs outgoing mail', ok: health.dkim },
    ];
  });

  protected readonly detail = computed(() => {
    const summary = this.dns.summary();
    if (!summary) return '';
    if (summary.allMatched) return 'All records are correctly configured.';
    const parts = [`${summary.missing} missing`, `${summary.mismatch} with a wrong value`];
    if (summary.unchecked) parts.push(`${summary.unchecked} not checked`);
    return `${parts.join(', ')}. Some records still need to be added or corrected at your DNS provider.`;
  });

  protected readonly percent = computed(() => {
    const summary = this.dns.summary();
    return summary && summary.total ? (summary.matched / summary.total) * 100 : 0;
  });
}
