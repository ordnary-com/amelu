import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { UI } from '../ui';
import { RoutingApi } from './routing-api';
import { ConfirmDelete, ListSkeleton, domainResource } from './shared';

/** The current dashboard's /domains/:id/domain-aliases: other domain names that deliver into this domain. */
@Component({
  selector: 'amelu-domain-aliases',
  imports: [RouterLink, PageHeader, Alert, EmptyState, Icon, ConfirmDelete, ListSkeleton],
  templateUrl: './domain-aliases.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DomainAliases {
  private readonly api = inject(Api);
  private readonly routing = inject(RoutingApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  private readonly resource = domainResource(this.ctx.id, (id) => this.api.listDomainAliases(id));
  protected readonly aliases = computed(
    () =>
      this.resource
        .value()
        ?.slice()
        .sort((a, b) => a.name.localeCompare(b.name)) ?? this.resource.value(),
  );

  protected readonly error = signal<string | null>(null);
  protected readonly deleteTarget = signal<string | null>(null);
  protected readonly deleting = signal(false);

  protected async confirmDelete(): Promise<void> {
    const name = this.deleteTarget();
    if (!name) return;
    this.deleting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.routing.deleteDomainAlias(this.ctx.id(), name));
      this.resource.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not remove domain alias'));
    } finally {
      this.deleteTarget.set(null);
      this.deleting.set(false);
    }
  }
}
