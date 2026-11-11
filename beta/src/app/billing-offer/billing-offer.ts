import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of } from 'rxjs';
import { Api, PlanOffer, errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon';
import { formatPrice } from '../billing';
import { UI } from '../ui';

const CLOSED: Record<Exclude<PlanOffer['status'], 'open'>, { title: string; text: string }> = {
  accepted: { title: 'This offer has been accepted', text: 'The plan is active on your organization.' },
  revoked: { title: 'This offer was withdrawn', text: 'Contact us if you still want a custom plan.' },
  expired: { title: 'This offer has expired', text: 'Contact us and we will send you a new one.' },
};

/** /billing/offer/:offerId, the link support sends with a custom plan. */
@Component({
  selector: 'amelu-billing-offer',
  imports: [Alert, EmptyState, Icon, RouterLink, DatePipe, DecimalPipe],
  template: `
    @if (cancelled) {
      <amelu-alert class="mb-5" kind="warning" title="Checkout was cancelled">Your plan hasn't changed.</amelu-alert>
    }
    @if (error(); as message) {
      <amelu-alert class="mb-5" kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
        {{ message }}
      </amelu-alert>
    }

    @if (offer() === undefined) {
      <div [class]="ui.card + ' h-80 max-w-xl animate-pulse'" aria-hidden="true"></div>
    } @else if (offer() === null) {
      <amelu-empty-state [class]="ui.card + ' max-w-xl'" title="This offer couldn't be found">
        It may belong to another organization. Sign in with the account the offer was made for.
      </amelu-empty-state>
    } @else if (offer(); as o) {
      @if (o.status !== 'open') {
        <amelu-empty-state [class]="ui.card + ' max-w-xl'" [title]="closed[o.status].title">
          {{ closed[o.status].text }}
          <a routerLink="/billing/overview" class="font-bold underline">Go to billing</a>
        </amelu-empty-state>
      } @else {
        <section class="max-w-xl rounded-lg border border-accent bg-surface p-5 ring-1 ring-accent">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-[16px] font-bold">{{ o.planName }}</h2>
            <span class="inline-flex items-center rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-link">Custom plan</span>
          </div>
          <p class="mt-1 text-[13px] text-muted">Put together for your organization. Valid until {{ o.expiresAt | date: 'd MMMM y' }}.</p>

          <div class="mt-4">
            <span class="text-[32px] leading-none font-normal tracking-[-0.02em]">{{ money(o.priceCents) }}</span>
            <span class="text-[13px] text-muted">/{{ o.interval === 'monthly' ? 'month' : 'year' }}</span>
          </div>

          <ul class="-mx-5 mt-5 space-y-2 border-t border-line px-5 pt-4 text-[13px]">
            <li class="flex gap-2.5">
              <amelu-icon name="check" [size]="14" class="mt-[3px] flex-none text-link" />
              <span><span class="font-semibold">{{ o.maxDomains | number }}</span> email domains</span>
            </li>
            <li class="flex gap-2.5">
              <amelu-icon name="check" [size]="14" class="mt-[3px] flex-none text-link" />
              <span><span class="font-semibold">{{ o.maxMailboxesPerDomain | number }}</span> mailboxes per domain</span>
            </li>
            <li class="flex gap-2.5">
              <amelu-icon name="check" [size]="14" class="mt-[3px] flex-none text-link" />
              @if (o.maxOutgoingPerDay > 0) {
                <span><span class="font-semibold">{{ o.maxOutgoingPerDay | number }}</span> outgoing messages/day per domain</span>
              } @else {
                <span>No daily limit on outgoing messages</span>
              }
            </li>
            @if (o.webmailBranding) {
              <li class="flex gap-2.5">
                <amelu-icon name="check" [size]="14" class="mt-[3px] flex-none text-link" />
                Branded webmail for your organization
              </li>
            }
            @for (perk of perks; track perk) {
              <li class="flex gap-2.5 text-muted">
                <amelu-icon name="check" [size]="14" class="mt-[3px] flex-none" />
                {{ perk }}
              </li>
            }
          </ul>

          <button type="button" [class]="ui.primary + ' mt-5 h-9 w-full justify-center'" [disabled]="busy()" (click)="accept(o)">
            {{ busy() ? 'One moment...' : 'Accept and pay' }}
          </button>
          <p class="mt-2.5 text-[12px] text-muted">
            Renews automatically every {{ o.interval === 'monthly' ? 'month' : 'year' }} until you cancel. If you already
            have a paid plan, it switches over and you only pay the difference.
          </p>
        </section>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BillingOffer {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  protected readonly ui = UI;
  protected readonly money = formatPrice;
  protected readonly closed = CLOSED;
  protected readonly perks = [
    'Unlimited storage per mailbox',
    'Forwarding & catch-all addresses',
    'Unlimited address & domain aliases',
    'Spam filtering & pattern rewrites',
    'DNS configuration & live health checks',
    'Priority email support',
  ];
  protected readonly cancelled = this.route.snapshot.queryParamMap.get('checkout') === 'cancelled';

  // undefined while loading, null when it doesn't exist for this organization
  protected readonly offer = toSignal(
    this.api.planOffer(this.route.snapshot.paramMap.get('offerId') ?? '').pipe(catchError(() => of(null))),
  );
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async accept(offer: PlanOffer): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      const { url } = await firstValueFrom(this.api.acceptPlanOffer(offer.id));
      window.location.href = url;
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not accept the offer'));
      this.busy.set(false);
    }
  }
}
