import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, SupportCategory, errorMessage } from '../api';
import { Domains } from '../domains';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { SupportTips } from './support-tips';
import { Icon } from '../icon';
import { SUPPORT_CATEGORIES } from './support-meta';
import { Combobox, ComboboxOption } from '../combobox/combobox';

const SUBJECT_MAX = 150;
const DOMAIN_STATUS: Record<string, string | undefined> = {
  unverified: 'Not verified',
  provisioning: 'Setting up',
  dns_pending: 'DNS pending',
  failed: 'Failed',
  suspended: 'Suspended',
};
const BODY_MAX = 20000;

/** /support/new: open a ticket. */
@Component({
  selector: 'amelu-support-new',
  imports: [Alert, Combobox, Icon, RouterLink, DecimalPipe, SupportTips],
  template: `
    <h1 class="flex items-center gap-2 text-[22px] leading-tight font-normal">
      <a routerLink="/support" class="text-link hover:underline">Support</a>
      <amelu-icon name="chevronRight" [size]="16" class="text-muted" />
      New ticket
    </h1>
    <p class="mt-1 text-[14px] text-muted">Tell us what's going on. We answer here and send you an email when we do.</p>

    <div class="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <form [class]="ui.setCard" (submit)="submit($event)">
        <div [class]="ui.setHeader"><h2 [class]="ui.setTitle">Your Question</h2></div>
        <div class="space-y-4 px-5 py-4">
          @if (error(); as message) {
            <amelu-alert>{{ message }}</amelu-alert>
          }
          <fieldset>
            <legend [class]="fieldLabel">Topic</legend>
            <!-- Topics as choice cards, the picked one tinted like the DNS choice on Add domain. -->
            <div class="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Topic">
              @for (c of categories; track c.id) {
                @let on = category() === c.id;
                <label [class]="ui.choice + ' flex items-center gap-3 px-3.5 py-3 ' + (on ? ui.choiceOn : ui.choiceOff)">
                  <input type="radio" name="topic" class="sr-only" [value]="c.id" [checked]="on" (change)="category.set(c.id)" />
                  <amelu-icon [name]="c.icon" [size]="20" class="flex-none" [class]="on ? 'text-link' : 'text-ink'" />
                  <span class="min-w-0">
                    <span class="block truncate text-[14px] font-medium" [class.text-link]="on">{{ c.label }}</span>
                    <span class="block truncate text-[12px]" [class]="on ? 'text-link/85' : 'text-muted'">{{ c.hint }}</span>
                  </span>
                </label>
              }
            </div>
          </fieldset>

          <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <div class="flex items-baseline justify-between gap-3">
                <label for="ticket-subject" [class]="fieldLabel">Subject</label>
                <span class="text-[12px] text-muted tabular-nums">{{ subject().length }} / {{ subjectMax }}</span>
              </div>
              <input
                id="ticket-subject"
                [class]="ui.input"
                [maxLength]="subjectMax"
                placeholder="Mail to Outlook addresses bounces"
                [value]="subject()"
                (input)="subject.set($any($event.target).value)"
                required
              />
            </div>
            <div>
              <label for="ticket-domain" [class]="fieldLabel">Domain <span class="text-muted/70">(optional)</span></label>
              <amelu-combobox class="mt-1.5" inputId="ticket-domain" [options]="domainOptions()" [(value)]="domainId" searchPlaceholder="Search domains" />
            </div>
          </div>

          <div>
            <div class="flex items-baseline justify-between gap-3">
              <label for="ticket-body" [class]="fieldLabel">Message</label>
              <span class="text-[12px] text-muted tabular-nums">{{ body().length | number }} / {{ bodyMax | number }}</span>
            </div>
            <textarea
              id="ticket-body"
              rows="8"
              [class]="ui.input + ' h-auto min-h-44 py-2 text-[14px] leading-relaxed [field-sizing:content]'"
              [maxLength]="bodyMax"
              placeholder="What happened, when, and which address was involved? Paste any error or bounce message."
              [value]="body()"
              (input)="body.set($any($event.target).value)"
              (keydown.meta.enter)="submit($event)"
              (keydown.control.enter)="submit($event)"
              required
            ></textarea>
            <p class="mt-1.5 text-[12px] text-muted">Don't include passwords. We never need them.</p>
          </div>

          <div class="flex items-center justify-end gap-2">
            <button type="button" [class]="ui.outline + ' h-9'" (click)="cancel()">Cancel</button>
            <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="!canSubmit()">{{ sending() ? 'Sending...' : 'Open ticket' }}</button>
          </div>
        </div>
      </form>

      <amelu-support-tips />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SupportNew {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly ui = UI;
  protected readonly fieldLabel = 'block text-[13px] text-muted';
  protected readonly categories = SUPPORT_CATEGORIES;
  protected readonly subjectMax = SUBJECT_MAX;
  protected readonly bodyMax = BODY_MAX;
  private readonly domainList = inject(Domains);
  protected readonly domainOptions = computed<ComboboxOption[]>(() => [
    { value: '', label: 'Not about one domain' },
    ...(this.domainList.list() ?? []).map((d) => ({ value: d.id, label: d.name, hint: DOMAIN_STATUS[d.status] })),
  ]);

  protected readonly subject = signal('');
  protected readonly category = signal<SupportCategory>('delivery');
  protected readonly domainId = signal('');
  protected readonly body = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(() => !this.sending() && this.subject().trim() !== '' && this.body().trim() !== '');


  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.error.set(null);
    this.sending.set(true);
    try {
      const created = await firstValueFrom(
        this.api.createSupportTicket({
          subject: this.subject().trim(),
          category: this.category(),
          domainId: this.domainId(),
          body: this.body().trim(),
        }),
      );
      await this.router.navigate(['/support/tickets', created.id]);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not open the ticket'));
    } finally {
      this.sending.set(false);
    }
  }

  protected cancel(): void {
    void this.router.navigate(['/support']);
  }
}
