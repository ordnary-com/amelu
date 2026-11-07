import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { badgeClass, Tone } from '../status';
import { UI } from '../ui';

type ServiceState = 'operational' | 'degraded' | 'outage';

interface Monitor {
  name: string;
  endpoint: string;
  state: ServiceState;
  uptime: number;
}

interface Incident {
  title: { en: string };
  state: 'investigating' | 'monitoring' | 'resolved';
  impact: 'minor' | 'major' | 'critical';
  startedAt: string;
  updates: { at: string; text: { en: string } }[];
}

interface Snapshot {
  updatedAt: string;
  groups: { monitors: Monitor[] }[];
  incidents: Incident[];
}

const STATE: Record<ServiceState, { label: string; tone: Tone }> = {
  operational: { label: 'Operational', tone: 'ok' },
  degraded: { label: 'Degraded', tone: 'warn' },
  outage: { label: 'Outage', tone: 'bad' },
};

// Managed in Airplane (the Amelu status page) and served by status.amelu.org,
// which allows this dashboard's origin (cloudflare/status).
const STATUS_URL = 'https://status.amelu.org/api/status';

async function loadStatus(): Promise<Snapshot | null> {
  try {
    const res = await fetch(STATUS_URL);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** The current dashboard's /status. */
@Component({
  selector: 'amelu-status-page',
  imports: [PageHeader, Alert, RouterLink, DatePipe, DecimalPipe],
  template: `
    <amelu-page-header title="Service Status">
      Current status of Amelu's services. The full page with uptime and past incidents is on
      <a href="https://status.amelu.org" class="font-medium text-link hover:underline">status.amelu.org</a>.
    </amelu-page-header>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        @if (status() === undefined) {
          <p class="text-[13px] text-muted">Loading...</p>
        } @else if (status() === null) {
          <amelu-alert kind="warning" title="The current status couldn't be loaded">
            See <a href="https://status.amelu.org" class="font-medium underline">status.amelu.org</a>.
          </amelu-alert>
        } @else if (allOperational()) {
          <amelu-alert kind="success" title="All systems operational" />
        } @else {
          <amelu-alert kind="warning" title="Some systems are experiencing issues" />
        }

        @for (incident of openIncidents(); track incident.startedAt) {
          <section [class]="ui.card + ' p-4'">
            <div class="flex items-baseline justify-between gap-3">
              <h2 class="text-[14px] font-bold">{{ incident.title.en }}</h2>
              <span class="text-[12px] text-muted">Since {{ incident.startedAt | date: 'd MMM, HH:mm' }}</span>
            </div>
            @if (incident.updates[0]; as latest) {
              <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{{ latest.text.en }}</p>
            }
          </section>
        }

        <section>
          <h2 [class]="ui.sectionTitle">Services</h2>
          <ul [class]="ui.card + ' overflow-hidden'">
            @for (service of monitors(); track service.name) {
              <li class="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[14px] font-medium">{{ service.name }}</div>
                  <div class="mt-0.5 truncate text-[12px] text-muted">{{ service.endpoint }} · {{ service.uptime | number: '1.0-2' }}% uptime, 90 days</div>
                </div>
                <span [class]="badge((state[service.state] ?? state.operational).tone)">{{ (state[service.state] ?? state.operational).label }}</span>
              </li>
            } @empty {
              <li class="px-4 py-3 text-[13px] text-muted">No services listed.</li>
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
  protected readonly state = STATE;
  protected readonly badge = badgeClass;
  // undefined while loading, null when it failed
  protected readonly status = toSignal(from(loadStatus()));
  protected readonly monitors = computed(() => this.status()?.groups.flatMap((g) => g.monitors) ?? []);
  protected readonly openIncidents = computed(() => this.status()?.incidents.filter((i) => i.state !== 'resolved') ?? []);
  protected readonly allOperational = computed(
    () => this.openIncidents().length === 0 && this.monitors().every((m) => m.state === 'operational'),
  );
}
