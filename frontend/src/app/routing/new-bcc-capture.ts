import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { UI } from '../ui';
import { RoutingApi } from './routing-api';

/** The current dashboard's /domains/:id/bccs/new. */
@Component({
  selector: 'amelu-new-bcc-capture',
  imports: [RouterLink, PageHeader, Alert, Icon],
  templateUrl: './new-bcc-capture.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NewBccCapture {
  private readonly routing = inject(RoutingApi);
  private readonly router = inject(Router);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  // The same form and summary styles as New mailbox.
  protected readonly sectionTitle = 'block text-[15px] font-medium';
  protected readonly field = 'mt-3 h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[15px] outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25';
  protected readonly label = 'text-[13px] text-muted';
  protected readonly box = 'space-y-1.5 rounded border border-line bg-surface px-3.5 py-3 text-[13px]';
  protected readonly pair = 'flex items-baseline justify-between gap-3';
  protected readonly examples = computed(() => {
    const domain = this.ctx.domain()?.name || 'yourdomain.tld';
    return [
      { pattern: `*@${domain}`, label: 'Everything on this domain' },
      { pattern: `sales*@${domain}`, label: 'Addresses starting with sales' },
    ];
  });

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
