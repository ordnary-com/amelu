import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { Alert } from '../alert';
import { EmptyState } from '../empty-state';
import { UI } from '../ui';

@Component({
  selector: 'amelu-vacation-settings',
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
        <label class="flex cursor-pointer items-center gap-2 text-[14px] font-medium">
          <input
            type="checkbox"
            name="enabled"
            class="size-4 accent-accent"
            [(ngModel)]="enabled"
            [disabled]="!loaded()"
          />
          Send an automatic reply
        </label>
        <p [class]="ui.hint">
          Each sender gets the reply once while it is on. Mailing lists and automated mail are
          skipped.
        </p>

        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label [class]="ui.label" for="from">From (optional)</label>
            <input
              id="from"
              name="from"
              type="date"
              [class]="ui.input"
              [(ngModel)]="from"
              [disabled]="!loaded()"
            />
          </div>
          <div>
            <label [class]="ui.label" for="to">Until (optional)</label>
            <input
              id="to"
              name="to"
              type="date"
              [class]="ui.input"
              [(ngModel)]="to"
              [disabled]="!loaded()"
            />
          </div>
        </div>

        <label [class]="ui.label + ' mt-5'" for="subject">Subject</label>
        <input
          id="subject"
          name="subject"
          type="text"
          [class]="ui.input"
          [(ngModel)]="subject"
          [disabled]="!loaded()"
          placeholder="Out of office"
        />

        <label [class]="ui.label + ' mt-5'" for="text">Message</label>
        <textarea
          id="text"
          name="text"
          rows="6"
          [class]="ui.textarea"
          [(ngModel)]="text"
          [disabled]="!loaded()"
          placeholder="I am away until ... and will reply when I am back."
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
export class VacationSettings {
  protected readonly ui = UI;
  private readonly api = inject(Api);
  protected enabled = false;
  protected subject = '';
  protected text = '';
  protected from = '';
  protected to = '';
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
      const { vacation } = await firstValueFrom(this.api.getSettings());
      this.enabled = vacation.enabled;
      this.subject = vacation.subject;
      this.text = vacation.text;
      this.from = vacation.from?.slice(0, 10) ?? '';
      this.to = vacation.to?.slice(0, 10) ?? '';
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
      await firstValueFrom(
        this.api.saveVacation({
          enabled: this.enabled,
          subject: this.subject.trim(),
          text: this.text,
          ...(this.from ? { from: `${this.from}T00:00:00Z` } : {}),
          ...(this.to ? { to: `${this.to}T23:59:59Z` } : {}),
        }),
      );
      this.saved.set(true);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not save'));
    } finally {
      this.busy.set(false);
    }
  }
}
