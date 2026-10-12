import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { Api, Mailbox } from '../api';
import { Domains } from '../domains';
import { DomainHealthChecks } from '../domain-health';
import { ActionIcon } from '../action-icon';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { DOMAIN_STATUS, MAILBOX_STATUS, badgeClass } from '../status';
import { UI } from '../ui';
import { EmptyState } from '../empty-state/empty-state';

type Kind = 'all' | 'mailboxes' | 'aliases';

interface AddressRow {
  key: string;
  kind: 'mailbox' | 'alias';
  address: string;
  name: string;
  detail: string;
  badge: { label: string; class: string } | null;
  link: string;
}

// undefined while loading, null when the request failed
type Loaded<T> = T | null | undefined;

/**
 * One domain at a glance. Replaces the current dashboard's "All Addresses"
 * landing page (frontend/src/pages/AllAddressesPage.tsx): the same address
 * list, now with aliases in it, plus DNS, activity and the domain's settings.
 */
@Component({
  selector: 'amelu-domain-detail',
  imports: [EmptyState, DatePipe, RouterLink, ActionIcon, Alert, Icon],
  templateUrl: './domain-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DomainDetail {
  private readonly api = inject(Api);
  protected readonly ui = UI;

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('domainId')!)), {
    requireSync: true,
  });

  private readonly domains = inject(Domains).list;
  // undefined while the list loads, null when it failed or has no such domain
  protected readonly domain = computed(() => {
    const list = this.domains();
    if (list === undefined) return undefined;
    return list?.find((domain) => domain.id === this.id()) ?? null;
  });
  protected readonly status = computed(() => {
    const domain = this.domain();
    if (!domain) return null;
    const status = DOMAIN_STATUS[domain.status];
    return { label: status.label, class: badgeClass(status.tone) };
  });

  private readonly healthById = inject(DomainHealthChecks).byId;
  protected readonly dns = computed(() => {
    const health = this.healthById()?.[this.id()];
    if (!health) return undefined;
    return [
      { label: 'MX', what: 'Receives mail', ok: health.mx },
      { label: 'SPF', what: 'Allowed to send', ok: health.spf },
      { label: 'DKIM', what: 'Signs outgoing mail', ok: health.dkim },
    ];
  });
  protected readonly dnsBroken = computed(() => this.dns()?.some((row) => row.ok === false) ?? false);

  protected readonly mailboxes = this.perDomain((id) => this.api.listMailboxes(id));
  protected readonly aliases = this.perDomain((id) => this.api.listAddressAliases(id));
  protected readonly domainAliases = this.perDomain((id) => this.api.listDomainAliases(id));
  protected readonly catchAll = this.perDomain((id) => this.api.getCatchAll(id));
  protected readonly activity = this.perDomain((id) => this.api.domainActivity(id).pipe(map((list) => list.slice(0, 5))));

  private readonly limit = toSignal(
    this.api.billingOverview().pipe(
      map((overview) => overview.plan.maxMailboxesPerDomain),
      catchError(() => of(null)),
    ),
  );

  protected readonly stats = computed(() => {
    const mailboxes = this.mailboxes();
    const limit = this.limit();
    const catchAll = this.catchAll();
    return [
      {
        label: 'Mailboxes',
        value: count(mailboxes),
        of: mailboxes && limit ? limit : null,
        full: !!mailboxes && !!limit && mailboxes.length >= limit,
        link: 'mailboxes',
      },
      { label: 'Address aliases', value: count(this.aliases()), of: null, full: false, link: 'aliases' },
      { label: 'Domain aliases', value: count(this.domainAliases()), of: null, full: false, link: 'domain-aliases' },
      {
        label: 'Catch-all',
        value: catchAll === undefined ? undefined : catchAll === null ? null : catchAll.address ? 'On' : 'Off',
        of: null,
        full: false,
        link: 'catchall',
      },
    ];
  });

  protected readonly kinds: { value: Kind; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'mailboxes', label: 'Mailboxes' },
    { value: 'aliases', label: 'Aliases' },
  ];
  protected readonly kind = signal<Kind>('all');
  protected readonly search = signal('');

  // Mailboxes first, then aliases, each alphabetically, like a mail client's address book.
  private readonly rows = computed<AddressRow[] | undefined>(() => {
    const mailboxes = this.mailboxes();
    const aliases = this.aliases();
    if (mailboxes === undefined) return undefined;
    const base = `/domains/${this.id()}`;
    const rows: AddressRow[] = (mailboxes ?? [])
      .slice()
      .sort((a, b) => a.address.localeCompare(b.address))
      .map((mailbox) => mailboxRow(mailbox, base));
    for (const alias of (aliases ?? []).slice().sort((a, b) => a.address.localeCompare(b.address))) {
      rows.push({
        key: 'alias:' + alias.address,
        kind: 'alias',
        address: alias.address,
        name: '',
        detail: 'Delivers to ' + alias.destinationMailbox,
        badge: null,
        link: `${base}/aliases`,
      });
    }
    return rows;
  });

  protected readonly filtered = computed(() => {
    const rows = this.rows();
    if (!rows) return undefined;
    const kind = this.kind();
    const query = this.search().trim().toLowerCase();
    return rows.filter(
      (row) =>
        (kind === 'all' || (kind === 'mailboxes') === (row.kind === 'mailbox')) &&
        (!query || row.address.toLowerCase().includes(query) || row.name.toLowerCase().includes(query)),
    );
  });

  protected readonly settings = [
    { label: 'Domain aliases', hint: 'Other domains that deliver here', link: 'domain-aliases' },
    { label: 'Catch-all recipient', hint: 'Mail to unknown addresses', link: 'catchall' },
    { label: 'Pattern rewrites', hint: 'Rewrite recipients by pattern', link: 'rewrites' },
    { label: 'Bcc. captures', hint: 'Copy mail to another address', link: 'bccs' },
    { label: 'Spam filtering', hint: 'Aggressiveness and sender lists', link: 'spam' },
    { label: 'DNS configuration', hint: 'Every record to set', link: 'dns' },
  ];

  protected readonly manage = [
    { label: 'Transfer ownership', link: 'transfer' },
    { label: 'Deactivate domain', link: 'deactivate' },
    { label: 'Delete domain', link: 'delete' },
  ];

  /** Refetches whenever the route moves to another domain, showing the loading state in between. */
  private perDomain<T>(load: (id: string) => Observable<T>) {
    return toSignal(
      toObservable(this.id).pipe(
        switchMap((id) =>
          load(id).pipe(
            map((value): Loaded<T> => value),
            catchError(() => of(null)),
            startWith(undefined),
          ),
        ),
      ),
      { initialValue: undefined as Loaded<T> },
    );
  }
}

// null (the request failed) shows as "Unavailable" rather than a misleading 0.
function count(list: Loaded<unknown[]>): number | null | undefined {
  return list ? list.length : list;
}

function mailboxRow(mailbox: Mailbox, base: string): AddressRow {
  const status = MAILBOX_STATUS[mailbox.status];
  return {
    key: 'mailbox:' + mailbox.id,
    kind: 'mailbox',
    address: mailbox.address,
    name: mailbox.displayName,
    detail: 'Mailbox',
    // Active is the normal case; only call out the exceptions.
    badge: mailbox.status === 'active' ? null : { label: status.label, class: badgeClass(status.tone) },
    link: `${base}/mailboxes/${mailbox.id}`,
  };
}
