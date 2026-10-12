import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { injectDomain } from '../domain-context';
import { Domains } from '../domains';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { DOMAIN_STATUS, badgeClass } from '../status';
import { UI } from '../ui';
import { DomainAdminApi } from './domain-admin-api';

@Component({
  selector: 'amelu-deactivate-domain',
  imports: [PageHeader, Alert, EmptyState, RouterLink],
  templateUrl: './deactivate-domain.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DeactivateDomain {
  private readonly api = inject(DomainAdminApi);
  private readonly domains = inject(Domains);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  protected readonly suspended = computed(() => this.ctx.domain()?.status === 'suspended');
  protected readonly status = computed(() => {
    const domain = this.ctx.domain();
    if (!domain) return null;
    const status = DOMAIN_STATUS[domain.status];
    return { label: status.label, class: badgeClass(status.tone) };
  });

  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<'deactivated' | 'reactivated' | null>(null);

  protected close(): void {
    if (!this.busy()) this.confirming.set(false);
  }

  protected async deactivate(): Promise<void> {
    await this.run('deactivated', () => this.api.deactivate(this.ctx.id()), 'Could not deactivate domain');
    this.confirming.set(false);
  }

  protected async reactivate(): Promise<void> {
    await this.run('reactivated', () => this.api.reactivate(this.ctx.id()), 'Could not reactivate domain');
  }

  private async run(outcome: 'deactivated' | 'reactivated', call: () => ReturnType<DomainAdminApi['deactivate']>, fallback: string) {
    this.error.set(null);
    this.done.set(null);
    this.busy.set(true);
    try {
      await firstValueFrom(call());
      this.done.set(outcome);
      this.domains.reload();
    } catch (err) {
      this.error.set(errorMessage(err, fallback));
    } finally {
      this.busy.set(false);
    }
  }
}
