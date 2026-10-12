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
  selector: 'amelu-transfer-domain',
  imports: [PageHeader, Alert, RouterLink],
  templateUrl: './transfer-domain.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TransferDomain {
  private readonly api = inject(DomainAdminApi);
  private readonly domains = inject(Domains);
  private readonly router = inject(Router);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  protected readonly email = signal('');
  protected readonly trimmed = computed(() => this.email().trim());
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected startConfirm(event: Event): void {
    event.preventDefault();
    if (!this.trimmed()) return;
    this.error.set(null);
    this.confirming.set(true);
  }

  protected close(): void {
    if (!this.busy()) this.confirming.set(false);
  }

  protected async transfer(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.transfer(this.ctx.id(), this.trimmed()));
      this.domains.reload();
      await this.router.navigateByUrl('/domains');
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not transfer domain'));
      this.confirming.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
