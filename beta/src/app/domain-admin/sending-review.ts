import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import { errorMessage } from '../api';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { EmptyState } from '../empty-state/empty-state';
import { Alert } from '../alert/alert';
import { Icon, IconName } from '../icon';
import { Session } from '../session';
import { UI } from '../ui';
import { DomainAdminApi, DomainStatus, SendingReviewCollection, SendingReviewVolume } from './domain-admin-api';

// The API's limits (handlers/sending_review.go).
const TEXT_MAX = 2000;
const SHORT_MAX = 1000;

const COLLECTIONS: { id: SendingReviewCollection; label: string; hint: string; icon: IconName }[] = [
  { id: 'customers', label: 'Own customers or contacts', hint: 'People who asked to hear from you', icon: 'users' },
  { id: 'signups', label: 'Website sign-ups', hint: 'A form on your own site', icon: 'globe' },
  { id: 'purchased', label: 'Purchased or scraped list', hint: 'Bought, rented or collected from the web', icon: 'listChecks' },
  { id: 'other', label: 'Something else', hint: 'Tell us how below', icon: 'dots' },
];

const VOLUMES: { id: SendingReviewVolume; label: string }[] = [
  { id: 'lt100', label: 'Fewer than 100' },
  { id: '100-1k', label: '100 to 1,000' },
  { id: '1k-10k', label: '1,000 to 10,000' },
  { id: 'gt10k', label: 'More than 10,000' },
];

/**
 * /domains/:id/status/review: a few questions that ask us to review a sending
 * pause, opened as a support ticket of its own kind (category sending_review).
 */
@Component({
  selector: 'amelu-sending-review',
  imports: [RouterLink, DatePipe, PageHeader, EmptyState, Alert, Icon],
  templateUrl: './sending-review.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SendingReviewPage {
  private readonly api = inject(DomainAdminApi);
  private readonly router = inject(Router);
  private readonly session = inject(Session);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly collections = COLLECTIONS;
  protected readonly volumes = VOLUMES;
  protected readonly textMax = TEXT_MAX;
  protected readonly shortMax = SHORT_MAX;

  // The same form and summary styles as New mailbox.
  protected readonly sectionTitle = 'block text-[15px] font-medium';
  protected readonly field =
    'mt-3 h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[15px] outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25';
  protected readonly area =
    'mt-3 block min-h-24 w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed outline-none [field-sizing:content] placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25';
  protected readonly label = 'text-[13px] text-muted';
  protected readonly box = 'space-y-1.5 rounded border border-line bg-surface px-3.5 py-3 text-[13px]';
  protected readonly pair = 'flex items-baseline justify-between gap-3';
  protected readonly policy = 'https://amelu.org/acceptable-use';
  protected readonly abuseMail = 'mailto:abuse@amelu.org';

  // undefined while loading, null when it failed.
  protected readonly status = toSignal(
    toObservable(this.ctx.id).pipe(
      switchMap((id) =>
        this.api.status(id).pipe(
          map((s): DomainStatus | null => s),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
    { initialValue: undefined },
  );
  protected readonly statusLink = computed(() => '/domains/' + this.ctx.id() + '/status');
  protected readonly canRequest = computed(() => ['owner', 'admin'].includes(this.session.customer()?.role ?? ''));

  protected readonly sends = signal('');
  protected readonly recipients = signal('');
  protected readonly collection = signal<SendingReviewCollection | null>(null);
  protected readonly collectionDetail = signal('');
  protected readonly volume = signal<SendingReviewVolume | null>(null);
  protected readonly changes = signal('');
  protected readonly accepted = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly valid = computed(
    () =>
      !!this.sends().trim() &&
      !!this.recipients().trim() &&
      !!this.collection() &&
      (this.collection() !== 'other' || !!this.collectionDetail().trim()) &&
      !!this.volume() &&
      !!this.changes().trim() &&
      this.accepted(),
  );
  protected readonly collectionLabel = computed(() => COLLECTIONS.find((c) => c.id === this.collection())?.label ?? null);
  protected readonly volumeLabel = computed(() => VOLUMES.find((v) => v.id === this.volume())?.label ?? null);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const collection = this.collection(), volume = this.volume();
    if (!this.valid() || this.busy() || !collection || !volume) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const review = await firstValueFrom(
        this.api.requestReview(this.ctx.id(), {
          sends: this.sends().trim(),
          recipients: this.recipients().trim(),
          collection,
          collectionDetail: collection === 'other' ? this.collectionDetail().trim() : '',
          volume,
          changes: this.changes().trim(),
          acceptPolicy: this.accepted(),
        }),
      );
      await this.router.navigate(['/support/tickets', review.ticketId]);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not send the request'));
    } finally {
      this.busy.set(false);
    }
  }
}
