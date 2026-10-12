import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';

/** Busy, error and saved state for one form's submit. */
export class Saving {
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);

  /** The response, or undefined when the request failed (the error is then set). */
  async run<T>(request: Observable<T>, fallback: string): Promise<T | undefined> {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const result = await firstValueFrom(request);
      this.saved.set(true);
      return result;
    } catch (err) {
      this.error.set(errorMessage(err, fallback));
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }

  reset(): void {
    this.error.set(null);
    this.saved.set(false);
  }
}

/** The error or success banner for a Saving. */
@Component({
  selector: 'amelu-save-feedback',
  imports: [Alert],
  template: `
    @if (state().error(); as message) {
      <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="state().error.set(null)">
        {{ message }}
      </amelu-alert>
    } @else if (state().saved()) {
      <amelu-alert kind="success" [title]="success()" [dismissible]="true" (dismissed)="state().saved.set(false)" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
})
export class SaveFeedback {
  readonly state = input.required<Saving>();
  readonly success = input('Saved.');
}
