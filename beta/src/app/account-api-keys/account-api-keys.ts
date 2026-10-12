import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Api, ApiKey, errorMessage } from '../api';
import { Icon } from '../icon';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { EmptyState } from '../empty-state/empty-state';

/** The current dashboard's /account/api-keys: list, create and revoke personal API keys. */
@Component({
  selector: 'amelu-account-api-keys',
  imports: [EmptyState, DatePipe, Icon, Alert],
  templateUrl: './account-api-keys.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:keydown.escape)': 'closeRevoke()',
  },
})
export class AccountApiKeys {
  private readonly api = inject(Api);
  protected readonly ui = UI;

  // undefined while loading
  protected readonly keys = signal<ApiKey[] | undefined>(undefined);
  protected readonly error = signal<string | null>(null);

  protected readonly name = signal('');
  protected readonly creating = signal(false);
  // Only ever in memory: the backend stores a hash and can't show it again.
  protected readonly newKey = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly revokeTarget = signal<ApiKey | null>(null);
  protected readonly revoking = signal(false);

  constructor() {
    void this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.keys.set(await firstValueFrom(this.api.listApiKeys()));
    } catch (err) {
      this.keys.set([]);
      this.error.set(errorMessage(err, 'Could not load API keys'));
    }
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.newKey.set(null);
    this.copied.set(false);
    this.creating.set(true);
    try {
      const created = await firstValueFrom(this.api.createApiKey(this.name().trim()));
      this.newKey.set(created.key);
      this.name.set('');
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not create API key'));
    } finally {
      this.creating.set(false);
    }
  }

  protected async copyKey(): Promise<void> {
    const key = this.newKey();
    if (!key) return;
    await navigator.clipboard.writeText(key);
    this.copied.set(true);
  }

  protected closeRevoke(): void {
    if (!this.revoking()) this.revokeTarget.set(null);
  }

  protected async confirmRevoke(): Promise<void> {
    const target = this.revokeTarget();
    if (!target) return;
    this.revoking.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.revokeApiKey(target.id));
      this.revokeTarget.set(null);
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not revoke API key'));
    } finally {
      this.revoking.set(false);
    }
  }
}
