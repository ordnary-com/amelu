import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { badgeClass, Tone } from '../status';
import { UI } from '../ui';
import { Icon } from '../icon';
import { DitherShader } from '../login/dither-shader';

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
  imports: [PageHeader, Alert, RouterLink, DatePipe, DecimalPipe, Icon, DitherShader],
  template: `
    <amelu-page-header title="Service status">
      Current status of Amelu's services. The full page with uptime and past incidents is on
      <a href="https://status.amelu.org" class="font-medium text-link hover:underline">status.amelu.org</a>.
    </amelu-page-header>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        @if (status() === null) {
          <amelu-alert kind="warning" title="The current status couldn't be loaded">
            See <a href="https://status.amelu.org" class="font-medium underline">status.amelu.org</a>.
          </amelu-alert>
        } @else if (status() !== undefined) {
          @if (allOperational()) {
            <amelu-alert kind="success" title="All systems operational" />
          } @else {
            <amelu-alert kind="warning" title="Some systems are experiencing issues" />
          }
        }

        @if (openIncidents().length) {
          <section>
            <h2 class="mb-3 flex items-center gap-2 text-[14px] font-bold">
              Open incidents
              <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ openIncidents().length }}</span>
            </h2>
            <ul [class]="ui.card + ' divide-y divide-line overflow-hidden'">
              @for (incident of openIncidents(); track incident.startedAt) {
                <li class="px-4 py-3">
                  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h3 class="flex items-center gap-2 text-[14px] font-medium">
                      <span class="size-2 flex-none rounded-full" [class]="incident.impact === 'minor' ? 'bg-warn' : 'bg-bad'" aria-hidden="true"></span>
                      {{ incident.title.en }}
                    </h3>
                    <span class="text-[12px] text-muted">Since {{ incident.startedAt | date: 'd MMM, HH:mm' }}</span>
                  </div>
                  @if (incident.updates[0]; as latest) {
                    <p class="mt-1 pl-4 text-[13px] leading-relaxed text-muted">{{ latest.text.en }}</p>
                  }
                </li>
              }
            </ul>
          </section>
        }

        <section>
          <h2 class="mb-3 flex items-center gap-2 text-[14px] font-bold">
            Services
            @if (monitors().length) {
              <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ monitors().length }}</span>
            }
          </h2>
          @if (status() === undefined) {
            <div [class]="ui.card + ' divide-y divide-line overflow-hidden'" aria-hidden="true">
              @for (i of [1, 2, 3]; track i) {
                <div class="flex items-center gap-3 px-4 py-3">
                  <span class="size-2 animate-pulse rounded-full bg-bg"></span>
                  <span class="h-3.5 w-48 animate-pulse rounded bg-bg"></span>
                </div>
              }
            </div>
          } @else {
            <ul [class]="ui.card + ' divide-y divide-line overflow-hidden'">
              @for (service of monitors(); track service.name) {
                <li class="flex items-center gap-3 px-4 py-3">
                  <span class="size-2 flex-none rounded-full" [class]="dot[stateOf(service).tone]" aria-hidden="true"></span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-[14px] font-medium">{{ service.name }}</div>
                    <div class="mt-0.5 truncate text-[12px] text-muted">
                      <span class="font-mono">{{ service.endpoint }}</span> · {{ service.uptime | number: '1.0-2' }}% uptime, 90 days
                    </div>
                  </div>
                  <span [class]="badge(stateOf(service).tone)">{{ stateOf(service).label }}</span>
                </li>
              } @empty {
                <li class="px-4 py-3 text-[13px] text-muted">No services listed.</li>
              }
            </ul>
          }
        </section>
      </div>

      <aside class="space-y-6">
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="lifebuoy" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Having trouble?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            If something isn't working and it isn't listed here, let us know. Include the affected domain and any error
            or bounce you received.
          </p>
          <a routerLink="/support" class="mt-4 inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-[13px] font-medium hover:border-ink/20 hover:bg-bg">Contact support</a>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">What the states mean</h2>
          <ul class="mt-3 space-y-2.5 text-[13px] leading-relaxed text-muted">
            <li class="flex items-start gap-2.5">
              <span [class]="badge('ok') + ' mt-px'">Operational</span>
              Working normally.
            </li>
            <li class="flex items-start gap-2.5">
              <span [class]="badge('warn') + ' mt-px'">Degraded</span>
              Working, but slower or with some errors.
            </li>
            <li class="flex items-start gap-2.5">
              <span [class]="badge('bad') + ' mt-px'">Outage</span>
              Not available right now.
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
  protected readonly badge = badgeClass;
  protected readonly dot: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', neutral: 'bg-muted' };
  // undefined while loading, null when it failed
  protected readonly status = toSignal(from(loadStatus()));
  protected readonly monitors = computed(() => this.status()?.groups.flatMap((g) => g.monitors) ?? []);
  protected readonly openIncidents = computed(() => this.status()?.incidents.filter((i) => i.state !== 'resolved') ?? []);
  protected readonly allOperational = computed(
    () => this.openIncidents().length === 0 && this.monitors().every((m) => m.state === 'operational'),
  );

  protected stateOf(service: Monitor): { label: string; tone: Tone } {
    return STATE[service.state] ?? STATE.operational;
  }
}
