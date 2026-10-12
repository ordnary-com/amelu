import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DnsRecordCheck } from '../api';
import { Icon } from '../icon';
import { badgeClass } from '../status';
import { RECORD_STATUS, relativeHost } from './dns-check';

/** One required record: each field with its own copy button, and what the live lookup found. */
@Component({
  selector: 'amelu-dns-record',
  imports: [Icon],
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <span class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px] font-bold">{{ record().type }}</span>
      <span class="min-w-0 flex-1 truncate text-[14px] font-semibold">{{ purpose() }}</span>
      <span [class]="status().class">{{ status().label }}</span>
    </div>

    <dl class="mt-3 space-y-2">
      @for (field of fields(); track field.label) {
        <div class="grid gap-1 sm:grid-cols-[72px_minmax(0,1fr)] sm:items-start sm:gap-3">
          <dt class="pt-1.5 text-[12px] text-muted">{{ field.label }}</dt>
          <dd class="flex min-w-0 items-start gap-2">
            <code class="min-w-0 flex-1 rounded-md bg-bg px-2.5 py-1.5 font-mono text-[12px] break-all">{{ field.value }}</code>
            <button
              type="button"
              class="inline-flex h-7 flex-none cursor-pointer items-center gap-1 rounded-md border border-line px-2 text-[12px] font-medium hover:bg-bg"
              [attr.aria-label]="'Copy ' + field.label.toLowerCase()"
              (click)="copy(field.label, field.value)"
            >
              <amelu-icon [name]="copied() === field.label ? 'check' : 'copy'" [size]="13" />
              {{ copied() === field.label ? 'Copied' : 'Copy' }}
            </button>
          </dd>
          @if (field.hint) {
            <p class="text-[12px] text-muted sm:col-start-2">{{ field.hint }}</p>
          }
        </div>
      }
    </dl>

    @if (record().status === 'mismatch' && record().actual?.length) {
      <div class="mt-3 rounded-md border border-bad/30 bg-bad/5 px-3 py-2">
        <p class="text-[12px] font-semibold text-bad">Currently published</p>
        <ul class="mt-1 space-y-1">
          @for (value of record().actual; track $index) {
            <li class="font-mono text-[12px] break-all text-muted">{{ value }}</li>
          }
        </ul>
        <p class="mt-1.5 text-[12px] text-muted">Replace {{ record().actual!.length === 1 ? 'this value' : 'these values' }} with the one above.</p>
      </div>
    } @else if (record().status === 'missing') {
      <p class="mt-3 text-[12px] text-muted">Nothing is published at this name yet.</p>
    } @else if (record().status === 'unchecked') {
      <p class="mt-3 text-[12px] text-muted">We don't look this record type up live. Add it as shown.</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DnsRecord {
  readonly record = input.required<DnsRecordCheck>();
  readonly domain = input.required<string>();

  protected readonly copied = signal<string | null>(null);

  protected readonly status = computed(() => {
    const status = RECORD_STATUS[this.record().status];
    return { label: status.label, class: badgeClass(status.tone) };
  });

  protected readonly purpose = computed(() => purposeOf(this.record()));

  protected readonly fields = computed(() => {
    const record = this.record();
    const host = relativeHost(record.name, this.domain());
    const full = record.name.replace(/\.$/, '');
    return [
      { label: 'Type', value: record.type, hint: '' },
      {
        label: 'Name',
        value: host,
        hint:
          host === '@'
            ? `"@" means ${full} itself. Some providers want it left empty instead.`
            : `If your provider wants the full name, use ${full}.`,
      },
      {
        label: 'Value',
        value: record.expected,
        // The check response has no priority, but Stalwart always publishes its MX at 10.
        hint: record.type === 'MX' ? 'Priority 10, if your provider asks for one.' : '',
      },
    ];
  });

  protected async copy(label: string, value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.copied.set(label);
    setTimeout(() => this.copied.update((current) => (current === label ? null : current)), 2000);
  }
}

function purposeOf(record: DnsRecordCheck): string {
  const name = record.name.toLowerCase();
  if (record.type === 'MX') return 'Receives mail';
  if (record.type === 'TXT' && record.expected.includes('v=spf1')) return 'SPF: allowed to send';
  if (name.includes('._domainkey.')) return 'DKIM: signs outgoing mail';
  if (name.startsWith('_dmarc.')) return 'DMARC: policy for failed checks';
  if (name.startsWith('_smtp._tls.')) return 'TLS reporting';
  if (name.startsWith('_mta-sts.') || name.startsWith('mta-sts.')) return 'MTA-STS: enforces encrypted delivery';
  if (record.type === 'SRV') return 'Mail app autodiscovery';
  if (record.type === 'CNAME') return 'Mail app setup';
  return record.type + ' record';
}
