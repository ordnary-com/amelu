import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { badgeClass, Tone } from '../status';
import { UI } from '../ui';

type ServiceState = 'operational' | 'degraded' | 'outage';

interface ServiceStatus {
  name: string;
  description: string;
  status: ServiceState;
}

const STATE: Record<ServiceState, { label: string; tone: Tone }> = {
  operational: { label: 'Operational', tone: 'ok' },
  degraded: { label: 'Degraded', tone: 'warn' },
  outage: { label: 'Outage', tone: 'bad' },
};

// Static, same as the current dashboard (frontend/src/pages/StatusPage.tsx): no monitoring backend feeds
// this yet, so components are reported operational by hand. Wire it to a real health check before relying
// on it during an actual incident.
const SERVICES: ServiceStatus[] = [
  { name: 'Mail Delivery', description: 'Inbound and outbound message routing', status: 'operational' },
  { name: 'IMAP / POP3', description: 'Mailbox access for mail clients', status: 'operational' },
  { name: 'SMTP Sending', description: 'Outgoing mail submission', status: 'operational' },
  { name: 'Webmail', description: 'Browser-based mailbox access', status: 'operational' },
  { name: 'API', description: 'Account, domain, and mailbox management', status: 'operational' },
  { name: 'DNS Verification', description: 'Domain and DNS record checks', status: 'operational' },
  { name: 'Billing', description: 'Stripe-backed subscription and invoicing', status: 'operational' },
];

/** The current dashboard's /status. */
@Component({
  selector: 'amelu-status-page',
  imports: [PageHeader, Alert, RouterLink],
  template: `
    <amelu-page-header title="Service Status">Current status of Amelu's services.</amelu-page-header>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        @if (allOperational) {
          <amelu-alert kind="success" title="All systems operational" />
        } @else {
          <amelu-alert kind="warning" title="Some systems are experiencing issues" />
        }

        <section>
          <h2 [class]="ui.sectionTitle">Services</h2>
          <ul [class]="ui.card + ' overflow-hidden'">
            @for (service of services; track service.name) {
              <li class="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[14px] font-medium">{{ service.name }}</div>
                  <div class="mt-0.5 truncate text-[12px] text-muted">{{ service.description }}</div>
                </div>
                <span [class]="badge(state[service.status].tone)">{{ state[service.status].label }}</span>
              </li>
            }
          </ul>
        </section>
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Having trouble?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            If something isn't working and it isn't listed here, let us know. Include the affected domain and any error
            or bounce you received.
          </p>
          <a routerLink="/support" class="mt-3 inline-block text-[13px] font-medium text-link hover:underline">
            Contact support
          </a>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">What the states mean</h2>
          <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-ok"></span>
              Operational: working normally.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-warn"></span>
              Degraded: working, but slower or with some errors.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-bad"></span>
              Outage: not available right now.
            </li>
          </ul>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class StatusPage {
  protected readonly ui = UI;
  protected readonly services = SERVICES;
  protected readonly state = STATE;
  protected readonly badge = badgeClass;
  protected readonly allOperational = SERVICES.every((s) => s.status === 'operational');
}
