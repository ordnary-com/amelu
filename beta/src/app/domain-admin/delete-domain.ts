import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { injectDomain } from '../domain-context';
import { Domains } from '../domains';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { DomainAdminApi } from './domain-admin-api';

@Component({
  selector: 'amelu-delete-domain',
  imports: [PageHeader, Alert, RouterLink],
  templateUrl: './delete-domain.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DeleteDomain {
  private readonly api = inject(DomainAdminApi);
  private readonly domains = inject(Domains);
  private readonly router = inject(Router);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  protected readonly confirming = signal(false);
  protected readonly typed = signal('');
  protected readonly matches = computed(() => {
    const name = this.ctx.domain()?.name;
    return !!name && this.typed().trim().toLowerCase() === name.toLowerCase();
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected open(): void {
    this.typed.set('');
    this.error.set(null);
    this.confirming.set(true);
  }

  protected close(): void {
    if (!this.busy()) this.confirming.set(false);
  }

  protected async remove(event?: Event): Promise<void> {
    event?.preventDefault();
    if (!this.matches() || this.busy()) return;
    this.error.set(null);
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.delete(this.ctx.id()));
      this.domains.reload();
      await this.router.navigateByUrl('/domains');
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not delete domain'));
      this.confirming.set(false);
      this.busy.set(false);
    }
  }
}
