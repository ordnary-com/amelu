import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Session } from '../session';
import { Avatar } from '../avatar';
import { DitherShader } from '../login/dither-shader';
import { ROLE, badgeClass } from '../status';

/** Profile banner and tabs shared by every /account page. */
@Component({
  selector: 'amelu-account-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Avatar, DitherShader],
  template: `
    <!-- Who you are, as a banner like the Overview greeting: the same dither, your picture and name large. -->
    <section class="relative overflow-hidden rounded-lg bg-hero px-7 pt-5 pb-6 text-hero-ink max-mobile:px-5">
      <div
        class="pointer-events-none absolute inset-0 opacity-45 [mask-image:linear-gradient(to_left,black_0%,rgba(0,0,0,0.7)_25%,rgba(0,0,0,0.3)_55%,rgba(0,0,0,0.06)_85%,transparent_100%)] max-mobile:opacity-25"
        aria-hidden="true"
      >
        <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="3" [speed]="0.35" />
      </div>
      <p class="relative text-[13px] font-medium text-hero-ink/70">My Account</p>
      @if (customer(); as me) {
        <div class="relative mt-6 flex min-w-0 items-center gap-5 max-mobile:mt-5 max-mobile:gap-4">
          <amelu-avatar class="size-16 ring-4 ring-surface/40 max-mobile:size-14" [src]="me.avatarUrl" [name]="me.name" [email]="me.email" [size]="64" />
          <div class="min-w-0">
            <h1 class="truncate text-[32px] leading-[1.15] font-normal tracking-[-0.02em] text-ink max-mobile:text-[26px]">{{ me.name || me.email }}</h1>
            <p class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-hero-ink/75">
              <span class="truncate">{{ me.email }}</span>
              <span aria-hidden="true">·</span>
              <span class="truncate">{{ me.organizationName }}</span>
              <span [class]="badge(me.role)">{{ roles[me.role].label }}</span>
            </p>
          </div>
        </div>
      } @else {
        <div class="relative mt-6 flex items-center gap-5" aria-hidden="true">
          <span class="size-16 animate-pulse rounded-full bg-hero-ink/10"></span>
          <span class="h-8 w-64 animate-pulse rounded bg-hero-ink/10"></span>
        </div>
      }
    </section>

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
  protected readonly customer = inject(Session).customer;
  protected readonly roles = ROLE;

  // The current dashboard's account sub-menu (frontend/src/components/Layout.tsx).
  protected readonly tabs = [
    { label: 'Overview', link: '/account' },
    { label: 'Appearance', link: '/account/appearance' },
    { label: 'API Keys', link: '/account/api-keys' },
  ];

  protected badge(role: keyof typeof ROLE): string {
    return badgeClass(ROLE[role].tone);
  }
}
