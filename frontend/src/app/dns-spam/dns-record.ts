import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DnsRecordCheck } from '../api';
import { Icon } from '../icon';
import { UI } from '../ui';
import { RECORD_STATUS, RECORD_STATUS_LOOK, relativeHost } from './dns-check';

/**
 * One required record as table rows: type, host and value with copy buttons and
 * the live status, plus a detail row with every field and what the lookup found.
 * A component on its own <tbody>, so the detail row stays inside the table.
 */
@Component({
  selector: 'tbody[ameluDnsRecord]',
  imports: [Icon],
  template: `
    <tr [class]="ui.tr + ' hover:bg-bg/40'">
      <td [class]="ui.td + ' w-0'">
        <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-medium uppercase">{{ record().type }}</span>
      </td>
      <td [class]="ui.td + ' max-w-[220px]'">
        <span class="flex min-w-0 items-center gap-1">
          <code class="min-w-0 truncate font-mono text-[12px]" [title]="host()">{{ host() }}</code>
          <button
            type="button"
            [class]="copyButton + (copied() === 'Name' ? ' text-ok' : ' text-muted hover:text-ink')"
            [attr.aria-label]="'Copy name ' + host()"
            [title]="copied() === 'Name' ? 'Copied' : 'Copy name'"
            (click)="copy('Name', host())"
          >
            <amelu-icon [name]="copied() === 'Name' ? 'check' : 'copy'" [size]="12" />
          </button>
        </span>
        <span [class]="ui.tdSub"><span class="truncate">{{ purpose() }}</span></span>
      </td>
      <td [class]="ui.td + ' max-w-[320px] max-md:hidden'">
        <span class="flex min-w-0 items-center gap-1">
          <code class="min-w-0 truncate font-mono text-[12px] text-muted" [title]="record().expected">{{ record().expected }}</code>
          <button
            type="button"
            [class]="copyButton + (copied() === 'Value' ? ' text-ok' : ' text-muted hover:text-ink')"
            aria-label="Copy value"
            [title]="copied() === 'Value' ? 'Copied' : 'Copy value'"
            (click)="copy('Value', record().expected)"
          >
            <amelu-icon [name]="copied() === 'Value' ? 'check' : 'copy'" [size]="12" />
          </button>
        </span>
      </td>
      <td [class]="ui.td + ' whitespace-nowrap'">
        <span class="inline-flex items-center gap-2">
          <span class="inline-flex size-5 flex-none items-center justify-center rounded-full" [class]="look().circle" aria-hidden="true">
            @if (look().icon; as icon) {
              <amelu-icon [name]="icon" [size]="12" />
            }
          </span>
          <span class="text-[12px]" [class]="look().text">{{ status().label }}</span>
        </span>
      </td>
      <td class="w-0 pr-3 text-right">
        <button
          type="button"
          class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink"
          [attr.aria-expanded]="open()"
          [attr.aria-label]="(open() ? 'Hide details for ' : 'Show details for ') + record().type + ' ' + host()"
          [title]="open() ? 'Hide details' : 'Show details'"
          (click)="expanded.set(!open())"
        >
          <amelu-icon name="chevronDown" [size]="14" class="transition-transform" [class.rotate-180]="open()" />
        </button>
      </td>
    </tr>

    @if (open()) {
      <tr class="border-t border-line bg-well">
        <td colspan="5" class="px-4 py-3">
          <dl class="space-y-2">
            @for (field of fields(); track field.label) {
              <div class="grid gap-1 sm:grid-cols-[72px_minmax(0,1fr)] sm:items-start sm:gap-3">
                <dt class="pt-1.5 text-[12px] text-muted">{{ field.label }}</dt>
                <dd class="flex min-w-0 items-start gap-2">
                  <code class="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[12px] break-all">{{ field.value }}</code>
                  <button
                    type="button"
                    class="inline-flex h-7 flex-none cursor-pointer items-center gap-1 rounded-md border border-line bg-surface px-2 text-[12px] font-medium hover:bg-bg"
                    [attr.aria-label]="'Copy ' + field.label.toLowerCase()"
                    (click)="copy(field.label, field.value)"
                  >
                    <amelu-icon [name]="copied() === field.label ? 'check' : 'copy'" [size]="12" [class.text-ok]="copied() === field.label" />
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
              <p class="text-[12px] font-medium text-bad">Currently published</p>
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
        </td>
      </tr>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DnsRecord {
  readonly record = input.required<DnsRecordCheck>();
  readonly domain = input.required<string>();

  protected readonly ui = UI;
  protected readonly copyButton =
    'inline-flex size-6 flex-none cursor-pointer items-center justify-center rounded hover:bg-bg';

  protected readonly copied = signal<string | null>(null);

  // null until toggled: a wrong value opens by default, so what's published now is in view.
  protected readonly expanded = signal<boolean | null>(null);
  protected readonly open = computed(() => this.expanded() ?? this.record().status === 'mismatch');

  protected readonly status = computed(() => RECORD_STATUS[this.record().status]);
  protected readonly look = computed(() => RECORD_STATUS_LOOK[this.record().status]);

  protected readonly purpose = computed(() => purposeOf(this.record()));

  protected readonly host = computed(() => relativeHost(this.record().name, this.domain()));

  protected readonly fields = computed(() => {
    const record = this.record();
    const host = this.host();
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
