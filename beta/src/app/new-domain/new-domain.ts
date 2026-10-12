import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { Api, Domain, errorMessage } from '../api';
import { Domains } from '../domains';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { UI } from '../ui';

// The addresses email standards expect on every domain (RFC 2142), same as the current dashboard.
const DEFAULT_ADDRESSES = ['admin', 'postmaster', 'abuse'];

interface CreatedAddress {
  address: string;
  password?: string;
  error?: string;
}

/** The current dashboard's /domains/new: add a domain, optionally with its default addresses. */
@Component({
  selector: 'amelu-new-domain',
  imports: [RouterLink, Alert, Icon],
  templateUrl: './new-domain.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NewDomain {
  private readonly api = inject(Api);
  private readonly domains = inject(Domains);
  protected readonly ui = UI;
  protected readonly defaults = DEFAULT_ADDRESSES;

  protected readonly input = signal('');
  protected readonly createDefaults = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<{ domain: Domain; addresses: CreatedAddress[] } | null>(null);
  protected readonly copied = signal<string | null>(null);

  /** What people paste is often a URL or an address; keep only the domain part. */
  protected readonly name = computed(() =>
    this.input()
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^.*@/, '')
      .replace(/[/?#].*$/, '')
      .replace(/\.$/, ''),
  );
  protected readonly valid = computed(() => /^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(this.name()));
  protected readonly www = computed(() => this.name().startsWith('www.'));
  // Shown once something has been typed that we'd change before sending.
  protected readonly cleaned = computed(() => {
    const raw = this.input().trim().toLowerCase();
    return raw && this.valid() && raw !== this.name() ? this.name() : null;
  });

  // null while unknown (loading or failed), so the form never blocks on it.
  protected readonly usage = toSignal(
    this.api.billingOverview().pipe(
      map((overview) => ({ max: overview.plan.maxDomains, plan: overview.plan.name })),
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );
  protected readonly used = computed(() => this.domains.list()?.length ?? null);
  protected readonly atLimit = computed(() => {
    const usage = this.usage();
    const used = this.used();
    return usage !== null && used !== null && used >= usage.max;
  });

  protected readonly usedPercent = computed(() => {
    const usage = this.usage();
    return usage ? Math.min(100, ((this.used() ?? 0) / usage.max) * 100) : 0;
  });

  protected readonly steps = [
    { title: 'Add the domain', text: 'We set it up on our mail servers.' },
    { title: 'Set the DNS records', text: 'At your domain registrar or DNS host. We check them live.' },
    { title: 'Create mailboxes', text: 'Then sign in from any mail app.' },
  ];

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const domain = await firstValueFrom(this.api.createDomain(this.name()));
      const addresses: CreatedAddress[] = [];
      if (this.createDefaults()) {
        // One by one, and a failure doesn't stop the rest: the domain exists either way.
        for (const localPart of DEFAULT_ADDRESSES) {
          try {
            const mailbox = await firstValueFrom(this.api.createMailbox(domain.id, localPart));
            addresses.push({ address: mailbox.address, password: mailbox.password });
          } catch (err) {
            addresses.push({ address: `${localPart}@${domain.name}`, error: errorMessage(err, 'Could not be created') });
          }
        }
      }
      this.result.set({ domain, addresses });
    } catch (err) {
      this.error.set(errorMessage(err, 'The domain could not be added.'));
    } finally {
      // Also after a failure, in case the API couldn't clean up and kept the domain marked failed.
      this.domains.reload();
      this.busy.set(false);
    }
  }

  protected async copy(address: CreatedAddress): Promise<void> {
    if (!address.password) return;
    await navigator.clipboard.writeText(address.password);
    this.copied.set(address.address);
  }
}
