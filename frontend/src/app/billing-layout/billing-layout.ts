import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Title and side menu shared by every /billing page, as on My Account. */
@Component({
  selector: 'amelu-billing-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h1 class="text-[22px] leading-tight font-normal">Billing</h1>
      <p class="text-[15px] text-muted">Manage your plan, invoices and payment details.</p>
    </div>

    <div class="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
      <!-- Same grouped side menu as My Account and My Organization. -->
      <nav class="space-y-5" aria-label="Billing">
        <div>
          <p class="mb-2 text-[13px] text-muted">Billing</p>
          <ul class="space-y-1.5">
            @for (tab of tabs; track tab.link) {
              <li>
                <a [routerLink]="tab.link" routerLinkActive="bg-accent/10! text-link!" [class]="navItem">{{ tab.label }}</a>
              </li>
            }
          </ul>
        </div>
      </nav>

      <div class="min-w-0">
        <router-outlet />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BillingLayout {
  protected readonly navItem = 'flex h-10 items-center rounded px-4 text-[14px] font-medium bg-bg/60 hover:bg-bg';
  protected readonly tabs = [
    { label: 'Overview', link: '/billing/overview' },
    { label: 'Plans', link: '/billing/plans' },
    { label: 'Invoices', link: '/billing/invoices' },
  ];
}
