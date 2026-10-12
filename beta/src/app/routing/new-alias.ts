import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { RoutingApi } from './routing-api';
import { MailboxField, domainResource, localPart } from './shared';

/**
 * The current dashboard's /domains/:id/aliases/new. Stalwart keeps alias
 * addresses unique per domain, so an alias delivers to one mailbox only.
 * ?mailbox=<id> preselects the destination, for links from a mailbox page.
 */
@Component({
  selector: 'amelu-new-alias',
  imports: [RouterLink, PageHeader, Alert, MailboxField],
  templateUrl: './new-alias.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NewAlias {
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

  protected readonly alias = signal('');
  protected readonly destination = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly valid = computed(
    () => !!localPart(this.alias()) && !!localPart(this.destination()),
  );
  protected readonly preview = computed(() => {
    const domain = this.ctx.domain()?.name ?? '';
    return {
      from: `${localPart(this.alias())}@${domain}`,
      to: `${localPart(this.destination())}@${domain}`,
    };
  });

  constructor() {
    const preselect = inject(ActivatedRoute).snapshot.queryParamMap.get('mailbox');
    effect(() => {
      const list = this.mailboxes();
      if (!list?.length || this.destination()) return;
      const match = list.find((m) => m.id === preselect);
      if (match) this.destination.set(match.localPart);
    });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { results } = await firstValueFrom(
        this.routing.createAddressAlias(
          this.ctx.id(),
          localPart(this.alias()),
          localPart(this.destination()),
        ),
      );
      const failure = results.find((result) => result.error);
      if (failure) {
        this.error.set(failure.error!);
        return;
      }
      await this.router.navigate(['/domains', this.ctx.id(), 'aliases']);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not create alias'));
    } finally {
      this.busy.set(false);
    }
  }
}
