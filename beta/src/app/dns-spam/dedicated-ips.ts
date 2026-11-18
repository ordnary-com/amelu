import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectDomain } from '../domain-context';
import { Icon } from '../icon';
import { DitherShader } from '../login/dither-shader';
import { Crumb, PageHeader } from '../page-header/page-header';
import { UI } from '../ui';

/** The Dedicated IPs add-on for a domain. No checkout yet: it's arranged through support. */
@Component({
  selector: 'amelu-dedicated-ips',
  imports: [PageHeader, RouterLink, Icon, DitherShader],
  template: `
    <amelu-page-header title="Dedicated IPs" [crumbs]="crumbs()">
      Send mail for {{ ctx.domain()?.name ?? 'this domain' }} from IP addresses used only by your organization.
    </amelu-page-header>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="globe" [size]="20" class="block text-ink" />
          <h2 class="mt-3 flex items-center gap-2 text-[14px] font-bold">
            Your own sending IPs
            <span class="rounded bg-accent/12 px-1.5 py-0.5 text-[11px] font-medium text-link">Add-on</span>
          </h2>
          <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-muted">
            Today this domain sends from Amelu's shared addresses, together with other customers. With dedicated IPs,
            its mail goes out from addresses only your organization uses, so its sending reputation depends on your
            mail alone. Available on any paid plan.
          </p>
          <a routerLink="/support" [class]="ui.outline + ' mt-4 bg-surface'">Contact us</a>
        </section>

        <section>
          <h2 [class]="ui.sectionTitle">What you get</h2>
          <ul [class]="ui.card + ' divide-y divide-line overflow-hidden'">
            @for (item of perks; track item.title) {
              <li class="flex items-start gap-3 px-4 py-3">
                <span class="mt-px flex size-6 flex-none items-center justify-center rounded-full bg-accent/10 text-accent" aria-hidden="true">
                  <amelu-icon [name]="item.icon" [size]="13" />
                </span>
                <div class="min-w-0">
                  <div class="text-[14px] font-medium">{{ item.title }}</div>
                  <div class="mt-0.5 text-[12px] text-muted">{{ item.text }}</div>
                </div>
              </li>
            }
          </ul>
        </section>
      </div>

      <aside class="space-y-3">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Shared sending IPs</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            See every address Amelu's mail server sends from today, each with its own hostname and reverse DNS.
          </p>
          <a routerLink="/network" class="mt-3 inline-block text-[13px] font-medium text-link hover:underline">View sending IPs</a>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DedicatedIps {
  protected readonly ctx = injectDomain();
  protected readonly ui = UI;
  protected readonly crumbs = computed<Crumb[]>(() => [
    { label: 'Domains', link: '/domains' },
    { label: this.ctx.domain()?.name ?? '', link: '/domains/' + this.ctx.id() },
    { label: 'Dedicated IPs' },
  ]);
  protected readonly perks = [
    { icon: 'globe', title: 'Addresses for your organization only', text: 'No other customer sends from them, so their mail never affects yours.' },
    { icon: 'check', title: 'Hostname and reverse DNS', text: 'Each address gets its own hostname with matching reverse DNS, like our shared ones.' },
    { icon: 'lifebuoy', title: 'Arranged with our team', text: 'We set the addresses up together with you and let you know when they are ready.' },
  ] as const;
}
