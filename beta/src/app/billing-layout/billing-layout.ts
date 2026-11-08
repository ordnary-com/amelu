import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Api } from '../api';
import { planPriceLine } from '../billing';
import { DitherShader } from '../login/dither-shader';
import { SUBSCRIPTION_STATUS, badgeClass } from '../status';
import { UI } from '../ui';

/** Plan banner and tabs shared by every /billing page. */
@Component({
  selector: 'amelu-billing-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, DitherShader],
  template: `
    <!-- Your plan as a banner, like the Overview greeting: the same dither, the plan's name large. -->
    <section class="relative overflow-hidden rounded-lg bg-hero px-7 pt-5 pb-6 text-hero-ink max-mobile:px-5">
      <div
        class="pointer-events-none absolute inset-0 opacity-45 [mask-image:linear-gradient(to_left,black_0%,rgba(0,0,0,0.7)_25%,rgba(0,0,0,0.3)_55%,rgba(0,0,0,0.06)_85%,transparent_100%)] max-mobile:opacity-25"
        aria-hidden="true"
      >
        <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="3" [speed]="0.35" />
      </div>
      <div class="relative flex flex-wrap items-center justify-between gap-3">
        <p class="text-[13px] font-medium text-hero-ink/70">Billing</p>
        <a routerLink="/billing/plans" [class]="ui.outline + ' bg-surface/70 backdrop-blur-sm'">Change plan</a>
      </div>
      @if (overview(); as o) {
        <h1 class="relative mt-6 text-[32px] leading-[1.15] font-normal tracking-[-0.02em] text-ink max-mobile:mt-5 max-mobile:text-[26px]">
          {{ o.plan.name }} plan
        </h1>
        <p class="relative mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-hero-ink/75">
          <span>{{ priceLine(o) }}</span>
          @if (o.subscriptionStatus; as status) {
            <span [class]="badge(subscriptionStatus[status]?.tone ?? 'neutral')">{{ subscriptionStatus[status]?.label ?? status }}</span>
          }
        </p>
      } @else if (overview() === undefined) {
        <span class="relative mt-6 block h-9 w-56 animate-pulse rounded bg-hero-ink/10" aria-hidden="true"></span>
      } @else {
        <h1 class="relative mt-6 text-[32px] leading-[1.15] font-normal tracking-[-0.02em] text-ink">Billing</h1>
        <p class="relative mt-2 text-[13px] text-hero-ink/75">Manage your plan, invoices, and payment details.</p>
      }
    </section>

    <nav
      class="mt-5 flex gap-5 overflow-x-auto text-[13px] shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none]"
      aria-label="Billing"
    >
      @for (tab of tabs; track tab.link) {
        <a
          [routerLink]="tab.link"
          routerLinkActive="border-accent! font-semibold text-ink!"
          class="border-b-2 border-transparent pb-2.5 whitespace-nowrap text-muted hover:text-ink"
        >
          {{ tab.label }}
        </a>
      }
    </nav>

    <div class="mt-6">
      <router-outlet />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BillingLayout {
  protected readonly ui = UI;
  protected readonly badge = badgeClass;
  protected readonly subscriptionStatus = SUBSCRIPTION_STATUS;
  protected readonly priceLine = planPriceLine;
  // undefined while loading, null when the request failed
  protected readonly overview = toSignal(inject(Api).billingOverview().pipe(catchError(() => of(null))));

  // The current dashboard's billing sub-menu (frontend/src/components/Layout.tsx).
  protected readonly tabs = [
    { label: 'Overview', link: '/billing/overview' },
    { label: 'Plans', link: '/billing/plans' },
    { label: 'Invoices', link: '/billing/invoices' },
  ];
}
