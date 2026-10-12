import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { RoutingApi } from './routing-api';

/** The current dashboard's /domains/:id/domain-aliases/new. */
@Component({
  selector: 'amelu-new-domain-alias',
  imports: [RouterLink, PageHeader, Alert],
  templateUrl: './new-domain-alias.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NewDomainAlias {
  private readonly routing = inject(RoutingApi);
  private readonly router = inject(Router);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  protected readonly name = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cleaned = computed(() => this.name().trim().toLowerCase());
  protected readonly sameAsDomain = computed(
    () => !!this.cleaned() && this.cleaned() === this.ctx.domain()?.name,
  );

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.cleaned() || this.sameAsDomain() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.routing.createDomainAlias(this.ctx.id(), this.cleaned()));
      await this.router.navigate(['/domains', this.ctx.id(), 'domain-aliases']);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not add domain alias'));
    } finally {
      this.busy.set(false);
    }
  }
}
