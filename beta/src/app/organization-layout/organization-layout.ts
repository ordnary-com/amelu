import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Session } from '../session';

/** Title and grouped side menu shared by every /organization page, as on My Account. */
@Component({
  selector: 'amelu-organization-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h1 class="text-[22px] leading-tight font-normal">
        @if (customer(); as me) {
          {{ me.organizationName }}
        } @else {
          My Organization
        }
      </h1>
      <p class="text-[15px] text-muted">Manage your team, its activity and your webmail.</p>
    </div>

    <div class="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
      <nav class="space-y-5" aria-label="Organization">
        @for (group of groups; track group.label) {
          <div>
            <p class="mb-2 text-[13px] text-muted">{{ group.label }}</p>
            <ul class="space-y-1.5">
              @for (item of group.items; track item.link) {
                <li>
                  <a [routerLink]="item.link" routerLinkActive="bg-accent/10! text-link!" [routerLinkActiveOptions]="{ exact: true }" [class]="navItem">
                    {{ item.label }}
                  </a>
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
export class OrganizationLayout {
  protected readonly customer = inject(Session).customer;
  protected readonly navItem = 'flex h-10 items-center rounded px-4 text-[14px] font-medium bg-bg/60 hover:bg-bg';
  protected readonly groups = [
    { label: 'Your organization', items: [{ label: 'Members', link: '/organization' }, { label: 'Activity Log', link: '/organization/activity' }] },
    { label: 'Branding', items: [{ label: 'Webmail', link: '/organization/webmail' }] },
  ];
}
