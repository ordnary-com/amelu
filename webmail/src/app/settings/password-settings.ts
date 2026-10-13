import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorCode, errorMessage } from '../api';
import { Alert } from '../alert';
import { UI } from '../ui';

@Component({
  selector: 'amelu-password-settings',
  imports: [FormsModule, Alert],
  template: `
    <form [class]="ui.card + ' p-5'" (ngSubmit)="save()">
      @if (error(); as message) {
        <amelu-alert class="mb-4" kind="error" [dismissible]="true" (dismissed)="error.set(null)">{{
          message
        }}</amelu-alert>
      }
      @if (saved()) {
        <amelu-alert class="mb-4" kind="success" [dismissible]="true" (dismissed)="saved.set(false)"
          >Your password has been changed. Update it in your mail apps too.</amelu-alert
        >
      }
      <label [class]="ui.label" for="current">Current password</label>
      <input
        id="current"
        name="current"
        type="password"
        autocomplete="current-password"
        required
        [class]="ui.input"
        [(ngModel)]="current"
      />

      <label [class]="ui.label + ' mt-5'" for="next">New password</label>
      <input
        id="next"
        name="next"
        type="password"
        autocomplete="new-password"
        required
        minlength="8"
        [class]="ui.input"
        [(ngModel)]="next"
      />
      <p [class]="ui.hint">At least 8 characters.</p>

      <label [class]="ui.label + ' mt-5'" for="repeat">Repeat new password</label>
      <input
        id="repeat"
        name="repeat"
        type="password"
        autocomplete="new-password"
        required
        [class]="ui.input"
        [(ngModel)]="repeat"
      />

      <div class="mt-5">
        <button type="submit" [class]="ui.primary" [disabled]="busy()">
          {{ busy() ? 'Changing' : 'Change password' }}
        </button>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PasswordSettings {
  protected readonly ui = UI;
  private readonly api = inject(Api);
  protected current = '';
  protected next = '';
  protected repeat = '';
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    this.error.set(null);
    this.saved.set(false);
    if (this.next.length < 8) {
      this.error.set('The new password must be at least 8 characters.');
      return;
    }
    if (this.next !== this.repeat) {
      this.error.set('The new passwords do not match.');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.changePassword(this.current, this.next));
      this.saved.set(true);
      this.current = this.next = this.repeat = '';
    } catch (err) {
      const code = errorCode(err);
      this.error.set(
        code === 'INVALID_CREDENTIALS'
          ? 'The current password is not right.'
          : errorMessage(err, 'Could not change the password'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
