import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Session } from '../session';
import { ROLE, badgeClass } from '../status';
import { ORDNARY_ACCOUNT_URL } from '../config';
import { Icon } from '../icon';

/** Title and grouped side menu shared by every /account page. */
@Component({
  selector: 'amelu-account-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Icon],
  template: `
    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h1 class="text-[22px] leading-tight font-normal">
        @if (customer(); as me) {
          {{ me.name || me.email }}
        } @else {
          My Account
        }
      </h1>
      <p class="text-[15px] text-muted">Manage your account settings and preferences.</p>
    </div>

    <div class="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
      <!-- The account's pages in groups: grey items, the current one tinted in the accent. -->
      <nav class="space-y-5" aria-label="Account">
        @for (group of groups; track group.label) {
          <div>
            <p class="mb-2 text-[13px] text-muted">{{ group.label }}</p>
            <ul class="space-y-1.5">
              @for (item of group.items; track item.label) {
                <li>
                  @if (item.href) {
                    <a [href]="item.href" target="_blank" rel="noreferrer" [class]="navItem">
                      {{ item.label }}<amelu-icon name="external" [size]="15" class="ml-auto text-muted" />
                    </a>
                  } @else {
                    <a
                      [routerLink]="item.link"
                      routerLinkActive="bg-accent/10! text-link!"
                      [routerLinkActiveOptions]="{ exact: true }"
                      [class]="navItem + (item.danger ? ' text-bad' : '')"
                    >
                      {{ item.label }}
                    </a>
                  }
                </li>
              }
            </ul>
          </div>
        }
      </nav>

      <div class="min-w-0">
        <router-outlet />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AccountLayout {
  protected readonly customer = inject(Session).customer;
  protected readonly roles = ROLE;

  protected readonly navItem = 'flex h-10 items-center rounded px-4 text-[14px] font-medium bg-bg/60 hover:bg-bg';
  protected readonly groups: { label: string; items: { label: string; link?: string; href?: string; danger?: boolean }[] }[] = [
    { label: 'Your account', items: [{ label: 'Profile', link: '/account' }, { label: 'Appearance', link: '/account/appearance' }] },
    { label: 'Access', items: [{ label: 'API Keys', link: '/account/api-keys' }, { label: 'Ordnary account', href: ORDNARY_ACCOUNT_URL }] },
    { label: 'Danger zone', items: [{ label: 'Terminate account', link: '/account/terminate', danger: true }] },
  ];

  protected badge(role: keyof typeof ROLE): string {
    return badgeClass(ROLE[role].tone);
  }
}
