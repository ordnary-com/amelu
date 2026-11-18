import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, from, map, of } from 'rxjs';
import { Api, SendingIpStatus } from '../api';
import { RouterLink } from '@angular/router';
import { TONE_ICON, TONE_TEXT, Tone, badgeClass } from '../status';
import { UI } from '../ui';
import { Icon } from '../icon';

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
const IP_STATE: Record<SendingIpStatus['state'], { label: string; tone: Tone }> = {
  active: { label: 'Sending', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  pending: { label: 'Starting up', tone: 'neutral' },
  spare: { label: 'Standby', tone: 'neutral' },
};
const IP_ORDER: Record<SendingIpStatus['state'], number> = { active: 0, paused: 1, pending: 2, spare: 3 };
// Same pool names as the Sending IPs page.
const POOL_LABEL: Record<string, string> = {
  trusted: 'Customer mail',
  newdomains: 'New domains',
  system: 'Amelu notifications',
  spare: 'Reserve',
};
const lastOctet = (ip: string) => Number(ip.split('.').pop());

@Component({
  selector: 'amelu-status-page',
  imports: [RouterLink, DatePipe, DecimalPipe, Icon],
  template: `
    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h1 class="text-[22px] leading-tight font-normal">Service Status</h1>
      <a href="https://status.amelu.org" class="inline-flex items-center gap-1 text-[14px] text-link hover:underline">
        Uptime and past incidents on status.amelu.org <amelu-icon name="external" [size]="13" />
      </a>
    </div>

    <div class="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        <section [class]="ui.setCard">
          <div [class]="ui.setHeader"><h2 [class]="ui.setTitle">Overview</h2></div>
          <!-- Label over value, in columns split by thin lines. -->
          <dl class="grid sm:grid-cols-3 sm:divide-x sm:divide-line">
            <div [class]="field">
              <dt [class]="fieldLabel">Current status</dt>
              <dd [class]="fieldValue">
                @if (status() === undefined) {
                  <span class="mt-1.5 block h-4 w-40 animate-pulse rounded bg-bg"></span>
                } @else if (status() === null) {
                  <span class="text-muted">Couldn't be loaded</span>
                } @else if (allOperational()) {
                  <span class="inline-flex items-center gap-1.5 text-ok"><amelu-icon name="circleCheck" [size]="17" />All systems operational</span>
                } @else {
                  <span class="inline-flex items-center gap-1.5 text-warn"><amelu-icon name="circleAlert" [size]="17" />Some issues</span>
                }
              </dd>
            </div>
            <div [class]="field">
              <dt [class]="fieldLabel">Services</dt>
              <dd [class]="fieldValue">{{ status() === undefined ? '...' : monitors().length }}</dd>
            </div>
            <div [class]="field">
              <dt [class]="fieldLabel">Open incidents</dt>
              <dd [class]="fieldValue" [class.text-bad]="openIncidents().length > 0">{{ status() === undefined ? '...' : openIncidents().length }}</dd>
            </div>
          </dl>
          @if (status() === null) {
            <p [class]="ui.setNote">
              <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
              <span>The current status couldn't be loaded here. See <a href="https://status.amelu.org" class="text-link hover:underline">status.amelu.org</a>.</span>
            </p>
          }
        </section>

        @if (openIncidents().length) {
          <section [class]="ui.panel">
            <div [class]="ui.panelHeader">
              <h2 [class]="ui.panelTitle">Open Incidents <span class="font-normal text-muted">({{ openIncidents().length }})</span></h2>
            </div>
            <div [class]="ui.well">
              <div [class]="ui.tableWrap">
                <table [class]="ui.table">
                  <thead>
                    <tr>
                      <th [class]="ui.th">Incident</th>
                      <th [class]="ui.th">Impact</th>
                      <th [class]="ui.th + ' max-sm:hidden'">Since</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (incident of openIncidents(); track incident.startedAt) {
                      <tr [class]="ui.tr">
                        <td [class]="ui.td">
                          <span class="block font-medium">{{ incident.title.en }}</span>
                          @if (incident.updates[0]; as latest) {
                            <span class="mt-0.5 block text-[12px] leading-snug text-muted">{{ latest.text.en }}</span>
                          }
                        </td>
                        <td [class]="ui.td">
                          <span class="inline-flex items-center gap-1.5 whitespace-nowrap" [class]="incident.impact === 'minor' ? 'text-warn' : 'text-bad'">
                            <amelu-icon [name]="incident.impact === 'minor' ? 'circleAlert' : 'circleX'" [size]="16" />{{ incident.impact === 'minor' ? 'Minor' : 'Major' }}
                          </span>
                        </td>
                        <td [class]="ui.td + ' whitespace-nowrap max-sm:hidden'">{{ incident.startedAt | date: 'd MMM, HH:mm' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        }

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">
              Services
              @if (monitors().length) {
                <span class="font-normal text-muted">({{ monitors().length }})</span>
              }
            </h2>
          </div>
          <div [class]="ui.well">
            <div [class]="ui.tableWrap">
              <table [class]="ui.table">
                <thead>
                  <tr>
                    <th [class]="ui.th">Service</th>
                    <th [class]="ui.th + ' max-sm:hidden'">Uptime, 90 days</th>
                    <th [class]="ui.th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  @if (status() === undefined) {
                    @for (i of [1, 2, 3]; track i) {
                      <tr [class]="ui.tr" aria-hidden="true"><td [class]="ui.td" colspan="3"><span class="block h-3 w-full animate-pulse rounded bg-bg"></span></td></tr>
                    }
                  } @else {
                    @for (service of monitors(); track service.name) {
                      <tr [class]="ui.tr">
                        <td [class]="ui.td + ' max-w-[360px]'">
                          <span class="block truncate font-medium">{{ service.name }}</span>
                          <span [class]="ui.tdSub"><span class="truncate font-mono">{{ service.endpoint }}</span></span>
                        </td>
                        <td [class]="ui.td + ' whitespace-nowrap tabular-nums max-sm:hidden'">{{ service.uptime | number: '1.0-2' }}%</td>
                        <td [class]="ui.td">
                          <span class="inline-flex items-center gap-1.5 whitespace-nowrap" [class]="toneText[stateOf(service).tone]">
                            <amelu-icon [name]="toneIcon[stateOf(service).tone]" [size]="16" />{{ stateOf(service).label }}
                          </span>
                        </td>
                      </tr>
                    } @empty {
                      <tr [class]="ui.tr"><td colspan="3" class="px-4 py-8 text-center text-muted">No services listed</td></tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">
              Sending IPs
              @if (sendingIps(); as list) {
                <span class="font-normal text-muted">({{ list.length }})</span>
              }
            </h2>
            <a routerLink="/network" [class]="ui.setAction" aria-label="All sending IPs" title="All sending IPs"><amelu-icon name="arrowRight" [size]="17" /></a>
          </div>
          <div [class]="ui.well">
            <div [class]="ui.tableWrap">
              <table [class]="ui.table">
                <thead>
                  <tr [class.text-muted]="!sendingIps()?.length">
                    <th [class]="ui.th">Address</th>
                    <th [class]="ui.th + ' max-md:hidden'">Used for</th>
                    <th [class]="ui.th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  @if (sendingIps() === undefined) {
                    @for (i of [1, 2, 3]; track i) {
                      <tr [class]="ui.tr" aria-hidden="true"><td [class]="ui.td" colspan="3"><span class="block h-3 w-full animate-pulse rounded bg-bg"></span></td></tr>
                    }
                  } @else {
                    @for (ip of sendingIps(); track ip.ip) {
                      <tr [class]="ui.tr">
                        <td [class]="ui.td">
                          <span class="block font-mono text-[13px] font-medium">{{ ip.ip }}</span>
                          <span [class]="ui.tdSub"><span class="truncate font-mono">{{ ip.name }}</span></span>
                        </td>
                        <td [class]="ui.td + ' max-md:hidden'">{{ poolLabel[ip.group] ?? 'Not assigned' }}</td>
                        <td [class]="ui.td">
                          <span class="inline-flex items-center gap-1.5 whitespace-nowrap" [class]="toneText[ipState[ip.state].tone]">
                            <amelu-icon [name]="toneIcon[ipState[ip.state].tone]" [size]="16" />{{ ipState[ip.state].label }}
                          </span>
                        </td>
                      </tr>
                    } @empty {
                      <tr [class]="ui.tr"><td colspan="3" class="px-4 py-8 text-center text-muted">No report from the mail server yet</td></tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-[13px] text-muted">
              Want to allowlist Amelu? Every address we can send from is on
              <a routerLink="/network" class="text-link hover:underline">Sending IPs</a>.
            </p>
          </div>
        </section>
      </div>

      <aside class="space-y-5">
        <section [class]="ui.setCard">
          <div [class]="ui.setHeader">
            <h2 [class]="ui.setTitle">Having Trouble?</h2>
            <a routerLink="/support" [class]="ui.setAction" aria-label="Contact support" title="Contact support"><amelu-icon name="arrowRight" [size]="17" /></a>
          </div>
          <p class="px-5 py-4 text-[14px] leading-relaxed text-muted">
            If something isn't working and it isn't listed here,
            <a routerLink="/support" class="text-link hover:underline">let us know</a>. Include the affected domain and any
            error or bounce you received.
          </p>
        </section>
        <section [class]="ui.setCard">
          <div [class]="ui.setHeader"><h2 [class]="ui.setTitle">What the States Mean</h2></div>
          <ul class="divide-y divide-line">
            @for (row of legend; track row.label) {
              <li class="px-5 py-3">
                <span class="inline-flex items-center gap-1.5 text-[14px] font-medium" [class]="toneText[row.tone]">
                  <amelu-icon [name]="toneIcon[row.tone]" [size]="16" />{{ row.label }}
                </span>
                <span class="mt-0.5 block text-[13px] text-muted">{{ row.text }}</span>
              </li>
            }
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
  protected readonly toneText = TONE_TEXT;
  // The addresses the mail server reports on (amelu-ip-pools on marduk), sending ones first.
  // undefined while loading; an empty list when there's no report or it can't load.
  protected readonly sendingIps = toSignal(
    inject(Api)
      .sendingNetwork()
      .pipe(
        map((n) => [...n.ips].sort((a, b) => IP_ORDER[a.state] - IP_ORDER[b.state] || lastOctet(a.ip) - lastOctet(b.ip))),
        catchError(() => of([] as SendingIpStatus[])),
      ),
  );
  protected readonly ipState = IP_STATE;
  protected readonly poolLabel = POOL_LABEL;
  protected readonly toneIcon = TONE_ICON;
  protected readonly legend: { label: string; tone: Tone; text: string }[] = [
    { label: 'Operational', tone: 'ok', text: 'Working normally.' },
    { label: 'Degraded', tone: 'warn', text: 'Working, but slower or with some errors.' },
    { label: 'Outage', tone: 'bad', text: 'Not available right now.' },
  ];
  // Label-over-value fields, as on My Account.
  protected readonly field = 'min-w-0 px-5 py-4 max-sm:not-first:border-t max-sm:not-first:border-line';
  protected readonly fieldLabel = 'text-[13px] text-muted';
  protected readonly fieldValue = 'mt-1 truncate text-[16px]';
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
