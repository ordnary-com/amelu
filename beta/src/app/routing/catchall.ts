import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { badgeClass } from '../status';
import { UI } from '../ui';
import { RoutingApi } from './routing-api';
import { domainResource } from './shared';

/** The current dashboard's /domains/:id/catchall: where mail to unknown addresses goes. */
@Component({
  selector: 'amelu-catchall',
  imports: [RouterLink, PageHeader, Alert, EmptyState],
  templateUrl: './catchall.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class Catchall {
  private readonly api = inject(Api);
  private readonly routing = inject(RoutingApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  private readonly loaded = domainResource(this.ctx.id, (id) => this.api.getCatchAll(id)).value;
  protected readonly mailboxes = domainResource(this.ctx.id, (id) => this.api.listMailboxes(id))
    .value;
  protected readonly rewrites = domainResource(this.ctx.id, (id) =>
    this.routing.listPatternRewrites(id),
  ).value;

  // What's saved right now; null until loaded.
  protected readonly current = signal<string | null>(null);
  protected readonly address = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal<'set' | 'cleared' | null>(null);

  protected readonly state = computed(() =>
    this.loaded() === undefined ? 'loading' : this.loaded() === null ? 'failed' : 'ready',
  );
  protected readonly changed = computed(
    () => this.address().trim().toLowerCase() !== (this.current() ?? ''),
  );
  protected readonly badge = computed(() =>
    this.current()
      ? { label: 'On', class: badgeClass('ok') }
      : { label: 'Off', class: badgeClass('neutral') },
  );

  constructor() {
    effect(() => {
      const loaded = this.loaded();
      if (!loaded) return;
      this.current.set(loaded.address ?? '');
      this.address.set(loaded.address ?? '');
    });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.changed()) void this.save(this.address());
  }

  protected async save(value: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(null);
    try {
      const result = await firstValueFrom(this.routing.updateCatchAll(this.ctx.id(), value.trim()));
      this.current.set(result.address ?? '');
      this.address.set(result.address ?? '');
      this.saved.set(result.address ? 'set' : 'cleared');
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not update catch-all recipient'));
    } finally {
      this.busy.set(false);
    }
  }
}
