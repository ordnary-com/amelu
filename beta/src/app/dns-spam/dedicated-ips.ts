import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectDomain } from '../domain-context';
import { Icon } from '../icon';
import { Crumb, PageHeader } from '../page-header/page-header';
import { UI } from '../ui';

/** The Dedicated IPs add-on for a domain. No checkout yet: it's arranged through support. */
@Component({
  selector: 'amelu-dedicated-ips',
  imports: [PageHeader, RouterLink, Icon],
  template: `
    <amelu-page-header title="Dedicated IPs" [crumbs]="crumbs()">
      Send mail for {{ ctx.domain()?.name ?? 'this domain' }} from IP addresses used only by your organization.
    </amelu-page-header>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        <section [class]="ui.setCard">
          <div [class]="ui.setHeader">
            <h2 [class]="ui.setTitle">Your own sending IPs</h2>
            <span class="rounded bg-accent/12 px-1.5 py-0.5 text-[11px] font-medium text-link">Add-on</span>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p class="max-w-xl text-[14px] text-muted">
              Without one, mail goes out from Amelu's shared addresses, together with other customers. A dedicated IP is
              €10 a month per address, on every plan.
            </p>
            <a routerLink="/organization/dedicated-ips" [class]="ui.primary + ' h-9'">Get a dedicated IP</a>
          </div>
          <p [class]="ui.setNote">
            <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
            <span>Dedicated IPs belong to your organization, so every domain in it sends from them, this one included.</span>
          </p>
        </section>

        <section [class]="ui.setCard">
          <div [class]="ui.setHeader">
            <h2 [class]="ui.setTitle">What you get</h2>
          </div>
          <ul class="divide-y divide-line">
            @for (item of perks; track item.title) {
              <li class="flex items-start gap-3 px-5 py-3">
                <amelu-icon [name]="item.icon" [size]="17" class="mt-0.5 flex-none text-ink" />
                <span class="min-w-0">
                  <span class="block text-[14px] font-medium">{{ item.title }}</span>
                  <span class="mt-0.5 block text-[13px] leading-snug text-muted">{{ item.text }}</span>
                </span>
              </li>
            }
          </ul>
        </section>
      </div>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Shared sending IPs</h2>
            <a routerLink="/network" class="text-[13px] text-link hover:underline">View sending IPs</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Every address Amelu's mail server sends from today, each with its own hostname and reverse DNS.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Keep your SPF record</h2>
            <a [routerLink]="'/domains/' + ctx.id() + '/dns'" class="text-[13px] text-link hover:underline">DNS</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              This domain sends from a dedicated IP only while its SPF record includes
              <code class="font-mono text-ink">_spf.amelu.org</code>, as the DNS page asks.
            </p>
          </div>
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
    { icon: 'mail', title: 'Addresses for your organization only', text: 'No other customer sends from them, so their mail never affects yours.' },
    { icon: 'globe', title: 'Hostname and reverse DNS', text: 'Each address gets its own hostname with matching reverse DNS, like our shared ones.' },
    { icon: 'lifebuoy', title: 'Arranged with our team', text: 'We set the addresses up together with you and let you know when they are ready.' },
  ] as const;
}
