import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { ImportAliasResult, RoutingApi } from './routing-api';
import { apiUrl } from '../config';

const FIELDS = [
  {
    name: 'Alias',
    description:
      'Required, the alias address: just the local part (sales) or the full address on this domain.',
  },
  {
    name: 'Destination',
    description: 'Required, an existing mailbox on this domain, written the same way.',
  },
];

/** The current dashboard's /domains/:id/aliases/import: bulk-create aliases from pasted CSV. */
@Component({
  selector: 'amelu-import-aliases',
  imports: [RouterLink, PageHeader, Alert],
  templateUrl: './import-aliases.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ImportAliases {
  private readonly routing = inject(RoutingApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly exportUrl = computed(() => apiUrl(`/api/domains/${this.ctx.id()}/address-aliases/export`));
  protected readonly fields = FIELDS;

  protected readonly csv = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly results = signal<ImportAliasResult[] | null>(null);
  protected readonly failed = computed(
    () => this.results()?.filter((result) => result.error).length ?? 0,
  );
  protected readonly examples = computed(() => {
    const domain = this.ctx.domain()?.name ?? 'yourdomain.tld';
    return ['sales,john', `info@${domain},john@${domain}`, 'support,helpdesk'].join('\n');
  });

  protected async loadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.csv.set(await file.text());
    input.value = '';
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.csv().trim() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { results } = await firstValueFrom(
        this.routing.importAddressAliases(this.ctx.id(), this.csv()),
      );
      this.results.set(results ?? []);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not import aliases'));
    } finally {
      this.busy.set(false);
    }
  }

  protected startOver(): void {
    this.results.set(null);
    this.csv.set('');
  }
}
