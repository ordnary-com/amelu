import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { RoutingApi } from './routing-api';

/** The current dashboard's /domains/:id/bccs/new. */
@Component({
  selector: 'amelu-new-bcc-capture',
  imports: [RouterLink, PageHeader, Alert],
  templateUrl: './new-bcc-capture.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NewBccCapture {
  private readonly routing = inject(RoutingApi);
  private readonly router = inject(Router);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  protected readonly pattern = signal('');
  protected readonly capture = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly valid = computed(
    () => !!this.pattern().trim() && this.capture().includes('@'),
  );

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.routing.createBccCapture(this.ctx.id(), this.pattern().trim(), this.capture().trim()),
      );
      await this.router.navigate(['/domains', this.ctx.id(), 'bccs']);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not create bcc capture'));
    } finally {
      this.busy.set(false);
    }
  }
}
