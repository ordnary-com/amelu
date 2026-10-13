import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AddressAlias, Api, errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { UI } from '../ui';
import { RoutingApi } from './routing-api';
import { ConfirmDelete, ListSkeleton, domainResource } from './shared';
import { apiUrl } from '../config';

/** The current dashboard's /domains/:id/aliases: every address alias across the domain's mailboxes. */
@Component({
  selector: 'amelu-address-aliases',
  imports: [RouterLink, PageHeader, Alert, EmptyState, Icon, ConfirmDelete, ListSkeleton],
  templateUrl: './address-aliases.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AddressAliases {
  private readonly api = inject(Api);
  private readonly routing = inject(RoutingApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly exportUrl = computed(() => apiUrl(`/api/domains/${this.ctx.id()}/address-aliases/export`));

  private readonly resource = domainResource(this.ctx.id, (id) => this.api.listAddressAliases(id));
  protected readonly aliases = this.resource.value;

  protected readonly search = signal('');
  protected readonly filtered = computed(() => {
    const aliases = this.aliases();
    if (!aliases) return aliases;
    const query = this.search().trim().toLowerCase();
    return aliases
      .filter(
        (alias) =>
          !query || alias.address.includes(query) || alias.destinationMailbox.includes(query),
      )
      .sort((a, b) => a.address.localeCompare(b.address));
  });

  protected readonly error = signal<string | null>(null);
  protected readonly deleteTarget = signal<AddressAlias | null>(null);
  protected readonly deleting = signal(false);

  protected async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.routing.deleteAddressAlias(target.destinationMailboxId, target.index),
      );
      this.deleteTarget.set(null);
      // Indexes shift within a mailbox after a delete, so the list has to come from the server again.
      this.resource.reload();
    } catch (err) {
      this.deleteTarget.set(null);
      this.error.set(errorMessage(err, 'Could not remove alias'));
    } finally {
      this.deleting.set(false);
    }
  }
}
