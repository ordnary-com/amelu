import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { RoutingApi } from './routing-api';
import { MailboxField, domainResource, localPart } from './shared';

/** The current dashboard's /domains/:id/rewrites/new. */
@Component({
  selector: 'amelu-new-pattern-rewrite',
  imports: [RouterLink, PageHeader, Alert, MailboxField],
  templateUrl: './new-pattern-rewrite.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NewPatternRewrite {
  private readonly api = inject(Api);
  private readonly routing = inject(RoutingApi);
  private readonly router = inject(Router);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  private readonly mailboxList = domainResource(this.ctx.id, (id) => this.api.listMailboxes(id))
    .value;
  protected readonly mailboxes = computed(() => {
    const list = this.mailboxList();
    return list
      ? list
          .filter((m) => m.status !== 'deleted')
          .sort((a, b) => a.localPart.localeCompare(b.localPart))
      : list;
  });
  protected readonly catchAll = domainResource(this.ctx.id, (id) => this.api.getCatchAll(id)).value;

  protected readonly pattern = signal('');
  protected readonly destination = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly valid = computed(
    () => !!this.pattern().trim() && !!localPart(this.destination()),
  );

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.routing.createPatternRewrite(
          this.ctx.id(),
          this.pattern().trim(),
          localPart(this.destination()),
        ),
      );
      await this.router.navigate(['/domains', this.ctx.id(), 'rewrites']);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not create pattern rewrite'));
    } finally {
      this.busy.set(false);
    }
  }
}
