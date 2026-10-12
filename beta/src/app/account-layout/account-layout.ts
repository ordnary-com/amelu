import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Header and tabs shared by every /account page. */
@Component({
  selector: 'amelu-account-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="min-w-0">
      <h1 class="text-[22px] font-bold tracking-[-0.4px]">My Account</h1>
      <p class="mt-1.5 text-[13px] text-muted">Your profile and how you sign in to Amelu.</p>
    </div>

    <nav
      class="mt-5 flex gap-5 overflow-x-auto text-[13px] shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none]"
      aria-label="Account"
    >
      @for (tab of tabs; track tab.link) {
        <a
          [routerLink]="tab.link"
          routerLinkActive="border-accent! font-semibold text-ink!"
          [routerLinkActiveOptions]="{ exact: true }"
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
export class AccountLayout {
  // The current dashboard's account sub-menu (frontend/src/components/Layout.tsx).
  protected readonly tabs = [
    { label: 'Overview', link: '/account' },
    { label: 'Appearance', link: '/account/appearance' },
    { label: 'API Keys', link: '/account/api-keys' },
  ];
}
