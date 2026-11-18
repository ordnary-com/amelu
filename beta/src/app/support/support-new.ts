import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, SupportCategory, errorMessage } from '../api';
import { Domains } from '../domains';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { SUPPORT_CATEGORIES } from './support-meta';
import { Combobox, ComboboxOption } from '../combobox/combobox';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';

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
  imports: [PageHeader, Alert, Combobox, HlmButtonImports, HlmCardImports, HlmFieldImports, HlmInputImports, HlmTextareaImports],
  template: `
    <amelu-page-header title="New ticket" [crumbs]="[{ label: 'Support', link: '/support' }, { label: 'New ticket' }]">
      Tell us what's going on. We answer here and send you an email when we do.
    </amelu-page-header>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <form hlmCard (submit)="submit($event)">
        <div hlmCardContent>
          <div hlmFieldGroup>
            @if (error(); as message) {
              <amelu-alert>{{ message }}</amelu-alert>
            }

            <div hlmField>
              <label hlmFieldLabel for="ticket-subject">Subject</label>
              <input
                hlmInput
                id="ticket-subject"
                [maxLength]="subjectMax"
                placeholder="Mail to Outlook addresses bounces"
                [value]="subject()"
                (input)="subject.set($any($event.target).value)"
                required
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div hlmField>
                <label hlmFieldLabel for="ticket-category">Topic</label>
                <amelu-combobox inputId="ticket-category" [options]="categoryOptions" [(value)]="category" searchPlaceholder="Search topics" />
              </div>
              <div hlmField>
                <label hlmFieldLabel for="ticket-domain">Domain <span class="font-normal text-muted-foreground">(optional)</span></label>
                <amelu-combobox inputId="ticket-domain" [options]="domainOptions()" [(value)]="domainId" searchPlaceholder="Search domains" />
              </div>
            </div>

            <div hlmField>
              <label hlmFieldLabel for="ticket-body">Message</label>
              <textarea
                hlmTextarea
                id="ticket-body"
                class="min-h-40 leading-relaxed"
                [maxLength]="bodyMax"
                placeholder="What happened, when, and which address was involved? Paste any error or bounce message."
                [value]="body()"
                (input)="body.set($any($event.target).value)"
                required
              ></textarea>
              <p hlmFieldDescription>Don't include passwords. We never need them.</p>
            </div>
          </div>
        </div>
        <div hlmCardFooter class="justify-end gap-2">
          <button hlmBtn variant="outline" type="button" (click)="cancel()">Cancel</button>
          <button hlmBtn type="submit" [disabled]="!canSubmit()">{{ sending() ? 'Sending...' : 'Open ticket' }}</button>
        </div>
      </form>

      <aside hlmCard size="sm">
        <div hlmCardHeader>
          <h2 hlmCardTitle>Get a faster answer</h2>
        </div>
        <ul hlmCardContent class="space-y-1.5 text-muted-foreground">
          <li>Name the domain and the address involved.</li>
          <li>Say roughly when it happened.</li>
          <li>Paste the full error or bounce message.</li>
        </ul>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SupportNew {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly categoryOptions: ComboboxOption[] = SUPPORT_CATEGORIES.map((c) => ({ value: c.id, label: c.label }));
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
