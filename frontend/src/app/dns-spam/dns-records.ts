import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { RECORD_STATUS, RECORD_STATUS_LOOK, injectDnsCheck } from './dns-check';
import { DnsRecord } from './dns-record';
import { DNS_TABS, SectionTabs } from '../section-tabs';

type Filter = 'all' | 'todo' | 'matched';

/** Every record the domain needs, with its live status. Replaces frontend/src/pages/DnsRecordsPage.tsx. */
@Component({
  selector: 'amelu-dns-records',
  imports: [Alert, DatePipe, DnsRecord, EmptyState, Icon, SectionTabs, PageHeader, RouterLink],
  templateUrl: './dns-records.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DnsRecords {
  protected readonly ui = UI;
  protected readonly dns = injectDnsCheck();
  protected readonly tabs = DNS_TABS;

  protected readonly crumbs = computed(() => [
    { label: 'Domains', link: '/domains' },
    { label: this.dns.domain()?.name ?? '', link: '/domains/' + this.dns.id() },
    { label: 'DNS' },
  ]);

  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'todo', label: 'Needs attention' },
    { value: 'matched', label: 'Verified' },
  ];
  protected readonly filter = signal<Filter>('all');

  protected readonly filtered = computed(() => {
    const records = this.dns.records();
    if (!records) return records;
    const filter = this.filter();
    if (filter === 'all') return records;
    return records.filter((r) => (r.status === 'matched') === (filter === 'matched'));
  });

  protected readonly legend = (
    [
      ['matched', 'Published exactly as expected.'],
      ['mismatch', 'Something is published at this name, but not this value.'],
      ['missing', 'Nothing is published at this name yet.'],
      ['unchecked', "A record type we don't look up live."],
    ] as const
  ).map(([status, text]) => ({ status, text, label: RECORD_STATUS[status].label, look: RECORD_STATUS_LOOK[status] }));

  protected readonly counts = computed(() => {
    const summary = this.dns.summary();
    if (!summary) return null;
    return (['matched', 'mismatch', 'missing', 'unchecked'] as const).map((status) => ({
      status,
      label: RECORD_STATUS[status].label,
      look: RECORD_STATUS_LOOK[status],
      count: summary[status],
    }));
  });
}
