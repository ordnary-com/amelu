import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import { errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { injectDomain } from '../domain-context';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { DomainAdminApi, DomainSettings } from './domain-admin-api';

@Component({
  selector: 'amelu-listing-settings',
  imports: [PageHeader, Alert, EmptyState, RouterLink],
  templateUrl: './listing-settings.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ListingSettings {
  private readonly api = inject(DomainAdminApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();

  // undefined while loading, null when the request failed or the domain is gone
  protected readonly settings = toSignal(
    toObservable(this.ctx.id).pipe(
      switchMap((id) =>
        this.api.domainSettings(id).pipe(
          map((settings): DomainSettings | null | undefined => settings),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
    { initialValue: undefined },
  );

  protected readonly current = linkedSignal(() => this.settings()?.publiclyListed ?? false);
  protected readonly listed = linkedSignal(() => this.current());
  protected readonly changed = computed(() => this.listed() !== this.current());

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected toggle(): void {
    this.listed.update((value) => !value);
    this.saved.set(false);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.saved.set(false);
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.api.updateListing(this.ctx.id(), this.listed()));
      this.current.set(result.publiclyListed);
      this.saved.set(true);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not update listing setting'));
    } finally {
      this.busy.set(false);
    }
  }
}
