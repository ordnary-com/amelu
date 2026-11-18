import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Api } from '../api';
import { Icon } from '../icon';
import { DEDICATED_IP_STATE, TONE_ICON, TONE_TEXT } from '../status';
import { UI } from '../ui';

/** /organization/dedicated-ips: the sending IPs reserved for this organization, and how to get one. */
@Component({
  selector: 'amelu-organization-dedicated-ips',
  imports: [DatePipe, RouterLink, Icon],
  template: `
    <p class="mb-5 max-w-3xl text-[14px] text-muted">
      IP addresses only your organization sends from, so your sending reputation depends on your mail alone.
    </p>

    <div class="space-y-5">
      <section [class]="ui.setCard">
        <div [class]="ui.setHeader">
          <h2 [class]="ui.setTitle">
            Dedicated IPs
            @if (ips(); as list) {
              <span class="font-normal text-muted">({{ list.length }})</span>
            }
          </h2>
        </div>
        <div [class]="ui.well">
          <div [class]="ui.tableWrap">
            <table [class]="ui.table">
              <thead>
                <tr [class.text-muted]="!ips()?.length">
                  <th [class]="ui.th">Address</th>
                  <th [class]="ui.th">Status</th>
                  <th [class]="ui.th + ' max-sm:hidden'">Since</th>
                </tr>
              </thead>
              <tbody>
                @if (ips() === undefined) {
                  <tr [class]="ui.tr" aria-hidden="true"><td [class]="ui.td" colspan="3"><span class="block h-3 w-full animate-pulse rounded bg-bg"></span></td></tr>
                } @else {
                  @for (ip of ips(); track ip.ip) {
                    <tr [class]="ui.tr">
                      <td [class]="ui.td">
                        <span class="block font-mono text-[13px] font-medium">{{ ip.ip }}</span>
                        <span [class]="ui.tdSub"><span class="truncate font-mono">{{ ip.hostname }}</span></span>
                      </td>
                      <td [class]="ui.td">
                        <span class="inline-flex items-center gap-1.5 whitespace-nowrap" [class]="toneText[state[ip.state].tone]">
                          <amelu-icon [name]="toneIcon[state[ip.state].tone]" [size]="16" />{{ state[ip.state].label }}
                        </span>
                      </td>
                      <td [class]="ui.td + ' whitespace-nowrap max-sm:hidden'">{{ ip.assignedAt ? (ip.assignedAt | date: 'd MMM y') : '' }}</td>
                    </tr>
                  } @empty {
                    <tr [class]="ui.tr">
                      <td colspan="3" class="px-4 py-10 text-center">
                        <amelu-icon name="globe" [size]="18" class="mx-auto block" />
                        <p class="mt-2">No dedicated IPs yet</p>
                        <p class="mx-auto mt-0.5 max-w-[380px] text-[13px] text-muted">Your mail goes out from our shared addresses. Ask us for a dedicated IP below.</p>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
        @if (ips()?.length) {
          <p [class]="ui.setNote">
            <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
            <span>All mail from your organization's domains goes out from these addresses. A new one says Setting up until its DNS is in place, which takes a few hours.</span>
          </p>
        }
      </section>

      <section [class]="ui.setCard">
        <div [class]="ui.setHeader">
          <h2 [class]="ui.setTitle">Request a Dedicated IP</h2>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p class="max-w-xl text-[14px] text-muted">
            A dedicated IP is €10 a month per address, on every plan. Tell us how much mail you send and we'll set one up for you.
          </p>
          <a routerLink="/support/new" [class]="ui.primary + ' h-9'">Contact our team</a>
        </div>
      </section>

      <section [class]="ui.setCard">
        <div [class]="ui.setHeader">
          <h2 [class]="ui.setTitle">How It Works</h2>
        </div>
        <ul class="divide-y divide-line">
          @for (row of howItWorks; track row.title) {
            <li class="flex items-start gap-3 px-5 py-3">
              <amelu-icon [name]="row.icon" [size]="17" class="mt-0.5 flex-none text-ink" />
              <span class="min-w-0">
                <span class="block text-[14px] font-medium">{{ row.title }}</span>
                <span class="mt-0.5 block text-[13px] leading-snug text-muted">{{ row.text }}</span>
              </span>
            </li>
          }
        </ul>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class OrganizationDedicatedIps {
  protected readonly ui = UI;
  protected readonly state = DEDICATED_IP_STATE;
  protected readonly toneText = TONE_TEXT;
  protected readonly toneIcon = TONE_ICON;
  // undefined while loading; an empty list when there are none or it can't load.
  protected readonly ips = toSignal(inject(Api).organizationDedicatedIps().pipe(catchError(() => of([]))));
  protected readonly howItWorks = [
    { icon: 'mail' as const, title: 'Only your mail', text: "Every domain in your organization sends from your own address. Nobody else's mail touches its reputation." },
    { icon: 'shield' as const, title: 'Nothing to change in DNS', text: 'Your SPF record already covers it, and the address has its own hostname with matching reverse DNS.' },
  ];
}
