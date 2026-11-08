import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { injectDomain } from '../domain-context';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { PageHeader } from '../page-header/page-header';
import { DNS_TABS, SectionTabs } from '../section-tabs';
import { UI } from '../ui';
import { DnsSpamApi, ZoneRecord, ZoneRecordInput } from './dns-spam-api';
import { NameserversCard } from './nameservers-card';
import { DitherShader } from '../login/dither-shader';

const TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'CAA', 'SRV', 'NS'];

const HINTS: Record<string, string> = {
  A: 'An IPv4 address, like 192.0.2.10',
  AAAA: 'An IPv6 address, like 2001:db8::10',
  CNAME: 'Another hostname, like example.netlify.app',
  TXT: 'Any text, like a site verification code',
  MX: 'A mail server hostname',
  CAA: 'Like: 0 issue "letsencrypt.org"',
  SRV: 'Priority, weight, port and target, like: 0 5 443 server.example.com',
  NS: 'A nameserver, to hand a subdomain to another DNS host',
};

/** The records in a zone Amelu hosts. Mail records are kept by Amelu and shown read-only. */
@Component({
  selector: 'amelu-dns-zone',
  imports: [Alert, DitherShader, EmptyState, FormsModule, Icon, NameserversCard, NgTemplateOutlet, PageHeader, RouterLink, SectionTabs],
  templateUrl: './dns-zone.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DnsZone {
  private readonly api = inject(DnsSpamApi);
  protected readonly ctx = injectDomain();
  protected readonly ui = UI;
  protected readonly tabs = DNS_TABS;
  protected readonly types = TYPES;
  protected readonly hints = HINTS;

  protected readonly crumbs = computed(() => [
    { label: 'Domains', link: '/domains' },
    { label: this.ctx.domain()?.name ?? '', link: '/domains/' + this.ctx.id() },
    { label: 'DNS' },
  ]);

  // undefined while loading; null when the domain keeps its own DNS
  protected readonly records = signal<ZoneRecord[] | null | undefined>(undefined);
  protected readonly loadError = signal<string | null>(null);
  protected readonly hosted = signal(true);

  protected readonly editing = signal<string | null>(null); // a record id, or 'new'
  protected readonly draft = signal<ZoneRecordInput>({ type: 'A', name: '', content: '' });
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly deleting = signal<string | null>(null);

  protected readonly sorted = computed(() => {
    const list = this.records();
    if (!list) return list;
    return [...list].sort((a, b) => Number(a.managed) - Number(b.managed) || a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  });

  protected readonly typeFilter = signal<string>('all');
  protected readonly search = signal('');
  protected readonly confirmingDelete = signal<string | null>(null);
  protected readonly copied = signal<string | null>(null);

  // Only the types the zone has, in the order of the form's type list.
  protected readonly typeChips = computed(() => {
    const list = this.records() ?? [];
    const counts = new Map<string, number>();
    for (const record of list) counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
    const known = TYPES.filter((t) => counts.has(t));
    const other = [...counts.keys()].filter((t) => !TYPES.includes(t)).sort();
    return [{ value: 'all', label: 'All', count: list.length }, ...[...known, ...other].map((t) => ({ value: t, label: t, count: counts.get(t)! }))];
  });

  /** Your own records first, then the ones Amelu keeps for email; empty groups drop out. */
  protected readonly groups = computed(() => {
    const list = this.sorted();
    if (!list) return list;
    const type = this.typeFilter();
    const query = this.search().trim().toLowerCase();
    const shown = list.filter(
      (record) =>
        (type === 'all' || record.type === type) &&
        (!query || this.short(record.name).toLowerCase().includes(query) || record.content.toLowerCase().includes(query)),
    );
    return [
      { key: 'own', title: 'Your records', hint: 'For your website and other services. Edit or delete them as you like.', records: shown.filter((r) => !r.managed) },
      { key: 'managed', title: 'Kept by Amelu for email', hint: 'These keep mail arriving and leaving. Amelu sets them and keeps them right.', records: shown.filter((r) => r.managed) },
    ].filter((group) => group.records.length > 0);
  });

  private sub?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      this.ctx.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.sub?.unsubscribe();
    this.loadError.set(null);
    this.sub = this.api.zoneRecords(this.ctx.id()).subscribe({
      next: (list) => {
        this.hosted.set(true);
        this.records.set(list);
      },
      error: (err) => {
        if (err?.status === 404 || err?.status === 503) {
          this.hosted.set(false);
          this.records.set(null);
        } else {
          this.loadError.set(errorMessage(err, 'The DNS records could not be loaded.'));
          this.records.set(this.records() ?? null);
        }
      },
    });
  }

  /** "www.example.com" shown as "www", the apex as "@". */
  protected short(name: string): string {
    const domain = this.ctx.domain()?.name ?? '';
    if (name === domain) return '@';
    return name.endsWith('.' + domain) ? name.slice(0, -(domain.length + 1)) : name;
  }

  protected startNew(): void {
    this.draft.set({ type: 'A', name: '', content: '' });
    this.formError.set(null);
    this.editing.set('new');
  }

  protected startEdit(record: ZoneRecord): void {
    this.draft.set({ type: record.type, name: this.short(record.name), content: record.content, priority: record.priority, ttl: record.ttl });
    this.formError.set(null);
    this.editing.set(record.id);
  }

  protected patch(change: Partial<ZoneRecordInput>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected save(event: Event): void {
    event.preventDefault();
    const id = this.editing();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.formError.set(null);
    const draft = this.draft();
    const request = id === 'new' ? this.api.createZoneRecord(this.ctx.id(), draft) : this.api.updateZoneRecord(this.ctx.id(), id, draft);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.load();
      },
      error: (err) => {
        this.formError.set(errorMessage(err, 'The record could not be saved.'));
        this.saving.set(false);
      },
    });
  }

  protected clearFilters(): void {
    this.typeFilter.set('all');
    this.search.set('');
  }

  protected async copy(record: ZoneRecord): Promise<void> {
    await navigator.clipboard.writeText(record.content);
    this.copied.set(record.id);
    setTimeout(() => this.copied.set(null), 1500);
  }

  // Confirmed inline on the row (Delete? Yes / No) instead of a browser dialog.
  protected remove(record: ZoneRecord): void {
    this.deleting.set(record.id);
    this.api.deleteZoneRecord(this.ctx.id(), record.id).subscribe({
      next: () => {
        this.deleting.set(null);
        this.confirmingDelete.set(null);
        this.load();
      },
      error: (err) => {
        this.deleting.set(null);
        this.confirmingDelete.set(null);
        this.loadError.set(errorMessage(err, 'The record could not be deleted.'));
      },
    });
  }
}
