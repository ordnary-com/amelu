import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Header and tabs shared by every /billing page. */
@Component({
  selector: 'amelu-billing-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="min-w-0">
      <h1 class="text-[22px] font-bold tracking-[-0.4px]">Billing</h1>
      <p class="mt-1.5 text-[13px] text-muted">Manage your plan, invoices, and payment details.</p>
    </div>

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
  // The current dashboard's billing sub-menu (frontend/src/components/Layout.tsx).
  protected readonly tabs = [
    { label: 'Overview', link: '/billing/overview' },
    { label: 'Plans', link: '/billing/plans' },
    { label: 'Invoices', link: '/billing/invoices' },
  ];
}
