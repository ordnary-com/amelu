import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { UI } from '../ui';
import { PatternRewrite, RoutingApi } from './routing-api';
import { ConfirmDelete, ListSkeleton, domainResource } from './shared';

/** The current dashboard's /domains/:id/rewrites. */
@Component({
  selector: 'amelu-pattern-rewrites',
  imports: [RouterLink, PageHeader, Alert, EmptyState, Icon, ConfirmDelete, ListSkeleton],
  templateUrl: './pattern-rewrites.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PatternRewrites {
  private readonly api = inject(Api);
  private readonly routing = inject(RoutingApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  private readonly resource = domainResource(this.ctx.id, (id) =>
    this.routing.listPatternRewrites(id),
  );
  protected readonly rewrites = this.resource.value;
  // Rewrites only see mail the catch-all would get, so they do nothing without one.
  protected readonly catchAll = domainResource(this.ctx.id, (id) => this.api.getCatchAll(id)).value;

  protected readonly error = signal<string | null>(null);
  protected readonly deleteTarget = signal<PatternRewrite | null>(null);
  protected readonly deleting = signal(false);

  protected async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.routing.deletePatternRewrite(this.ctx.id(), target.id));
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not remove pattern rewrite'));
    } finally {
      // Also after a failure: the API can delete the rule and then fail to update the mail cluster.
      this.resource.reload();
      this.deleteTarget.set(null);
      this.deleting.set(false);
    }
  }
}
