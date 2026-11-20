import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { UI } from '../ui';
import { RoutingApi } from './routing-api';
import { MailboxField, domainResource, localPart } from './shared';

/** The current dashboard's /domains/:id/rewrites/new. */
@Component({
  selector: 'amelu-new-pattern-rewrite',
  imports: [RouterLink, PageHeader, Alert, MailboxField, Icon],
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
  protected readonly noCatchAll = computed(() => !!this.catchAll() && !this.catchAll()?.address);

  protected readonly pattern = signal('');
  protected readonly destination = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly valid = computed(
    () => !!this.pattern().trim() && !!localPart(this.destination()),
  );

  protected readonly destinationAddress = computed(
    () => `${localPart(this.destination())}@${this.ctx.domain()?.name ?? ''}`,
  );
  // A plain reading of the pattern for the summary. The mail server matches it against the whole
  // recipient address, with * as any run of characters and ? as a single one.
  protected readonly reading = computed(() => {
    const pattern = this.pattern().trim().toLowerCase();
    if (!pattern) return null;
    if (!/[*?]/.test(pattern)) return 'Only this exact address';
    const at = pattern.lastIndexOf('@');
    const local = at < 0 ? pattern : pattern.slice(0, at);
    if (/^[^*?]+\*$/.test(local)) return `Addresses starting with ${local.slice(0, -1)}`;
    if (at >= 0 && /^\*[^*?]+$/.test(local)) return `Addresses ending in ${local.slice(1)}`;
    return 'Every address the pattern matches';
  });

  // The same form and summary styles as New mailbox.
  protected readonly sectionTitle = 'block text-[15px] font-medium';
  protected readonly label = 'text-[13px] text-muted';
  protected readonly box = 'space-y-1.5 rounded border border-line bg-surface px-3.5 py-3 text-[13px]';
  protected readonly pair = 'flex items-baseline justify-between gap-3';
  // Scales the shared mailbox picker up to this form's large label and h-11 fields.
  protected readonly bigField =
    '[&>label]:text-[15px] [&>span]:mt-3 [&>span]:h-11 [&>p]:mt-3 [&_select]:mt-3 [&_select]:h-11 [&_select]:bg-surface [&_select]:pl-3.5 [&_select]:text-[15px] [&_amelu-icon]:mt-[6px]';
  protected readonly order = ['Existing mailboxes and aliases', 'Pattern rewrites', 'Catch-all recipient'];

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
