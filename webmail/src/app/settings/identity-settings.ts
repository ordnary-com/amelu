import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { Alert } from '../alert';
import { EmptyState } from '../empty-state';
import { UI } from '../ui';

@Component({
  selector: 'amelu-identity-settings',
  imports: [FormsModule, Alert, EmptyState],
  template: `
    @if (loaded() === null) {
      <amelu-empty-state
        [class]="ui.card"
        title="The settings couldn't be loaded"
        [error]="true"
        (retry)="load()"
        >{{ error() }}</amelu-empty-state
      >
    } @else {
      <form [class]="ui.card + ' p-5'" (ngSubmit)="save()">
        @if (error(); as message) {
          <amelu-alert
            class="mb-4"
            kind="error"
            [dismissible]="true"
            (dismissed)="error.set(null)"
            >{{ message }}</amelu-alert
          >
        }
        @if (saved()) {
          <amelu-alert
            class="mb-4"
            kind="success"
            [dismissible]="true"
            (dismissed)="saved.set(false)"
            >Saved.</amelu-alert
          >
        }
        <label [class]="ui.label" for="name">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          [class]="ui.input"
          [(ngModel)]="name"
          [disabled]="!loaded()"
          placeholder="How your name shows on sent mail"
        />
        <p [class]="ui.hint">Shown next to your address on the messages you send.</p>

        <label [class]="ui.label + ' mt-5'" for="signature">Signature</label>
        <textarea
          id="signature"
          name="signature"
          rows="5"
          [class]="ui.textarea"
          [(ngModel)]="signature"
          [disabled]="!loaded()"
          placeholder="Added under every new message"
        ></textarea>

        <div class="mt-5">
          <button type="submit" [class]="ui.primary" [disabled]="busy() || !loaded()">
            {{ busy() ? 'Saving' : 'Save' }}
          </button>
        </div>
      </form>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class IdentitySettings {
  protected readonly ui = UI;
  private readonly api = inject(Api);
  protected name = '';
  protected signature = '';
  // false while loading, null when it failed
  protected readonly loaded = signal<boolean | null>(false);
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loaded.set(false);
    try {
      const settings = await firstValueFrom(this.api.getSettings());
      this.name = settings.identity.name;
      this.signature = settings.identity.textSignature;
      this.loaded.set(true);
    } catch (err) {
      this.loaded.set(null);
      this.error.set(errorMessage(err, 'Could not load the settings'));
    }
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      await firstValueFrom(this.api.saveIdentity(this.name.trim(), this.signature));
      this.saved.set(true);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not save'));
    } finally {
      this.busy.set(false);
    }
  }
}
