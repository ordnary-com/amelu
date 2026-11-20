import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { Icon } from '../../icon';

/** The current dashboard's MailboxRecentLogsPage: the latest sent and received messages. */
@Component({
  selector: 'amelu-mailbox-logs',
  imports: [DatePipe, RouterLink, EmptyState, MailboxHeading, Icon],
  template: `
    <amelu-mailbox-heading title="Recent traffic logs">The 20 most recent messages this mailbox sent and received.</amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        @if (logs() === null) {
          <amelu-empty-state class="rounded-lg border border-line bg-surface" title="The traffic logs couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          @for (section of sections(); track section.title) {
            <section [class]="ui.panel">
              <div [class]="ui.panelHeader">
                <h2 [class]="ui.panelTitle">
                  {{ section.title }}
                  @if (section.emails; as emails) {
                    <span class="font-normal text-muted">({{ emails.length }})</span>
                  }
                </h2>
              </div>
              <div [class]="ui.well">
                <div [class]="ui.tableWrap">
                  <table [class]="ui.table + ' min-w-[560px]'">
                    <thead>
                      <tr>
                        <th [class]="ui.th">Date</th>
                        <th [class]="ui.th">From</th>
                        <th [class]="ui.th">To</th>
                        <th [class]="ui.th">Subject</th>
                      </tr>
                    </thead>
                    <tbody>
                      @if (section.emails; as emails) {
                        @for (email of emails; track email.id) {
                          <tr [class]="ui.tr+ ' hover:bg-bg/40'">
                            <td [class]="ui.td + ' whitespace-nowrap text-muted tabular-nums'" [title]="email.receivedAt | date: 'd MMM y, HH:mm:ss'">{{ email.receivedAt | date: 'd MMM y, HH:mm' }}</td>
                            <td [class]="ui.td + ' font-mono text-[12px] break-all'">{{ email.from?.join(', ') }}</td>
                            <td [class]="ui.td + ' font-mono text-[12px] break-all'">{{ email.to?.join(', ') }}</td>
                            <td [class]="ui.td + ' break-words'">
                              @if (email.subject) {
                                {{ email.subject }}
                              } @else {
                                <span class="text-muted">(no subject)</span>
                              }
                            </td>
                          </tr>
                        } @empty {
                          <tr [class]="ui.tr">
                            <td colspan="4" class="px-4 py-10 text-center">
                              <amelu-icon name="inbox" [size]="18" class="mx-auto block" />
                              <p class="mt-2">No recent messages</p>
                              <p class="mt-0.5 text-[13px] text-muted">{{ section.empty }}</p>
                            </td>
                          </tr>
                        }
                      } @else {
                        @for (i of [1, 2, 3]; track i) {
                          <tr [class]="ui.tr" aria-hidden="true">
                            <td [class]="ui.td"><span class="block h-3 w-24 animate-pulse rounded bg-bg"></span></td>
                            <td [class]="ui.td"><span class="block h-3 w-36 animate-pulse rounded bg-bg"></span></td>
                            <td [class]="ui.td"><span class="block h-3 w-36 animate-pulse rounded bg-bg"></span></td>
                            <td [class]="ui.td"><span class="block h-3 w-48 animate-pulse rounded bg-bg"></span></td>
                          </tr>
                        }
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          }
        }
      </div>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Where this comes from</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Outgoing messages are read from the Sent folder and incoming ones from the Inbox, so a message the user has
              deleted or moved isn't listed.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Missing mail?</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Spam lands in the Junk folder instead. Also check whether forwarding or delegation sends it elsewhere.
            </p>
            <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <a [routerLink]="ctx.base() + '/forwarding'" class="text-link hover:underline">Forwarding</a>
              <a [routerLink]="ctx.base() + '/delegation'" class="text-link hover:underline">Delegation</a>
            </p>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxLogs {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly logs = perMailbox((id) => this.api.logs(id));

  protected readonly sections = computed(() => {
    const logs = this.logs();
    return [
      { title: 'Outgoing messages', emails: logs?.outgoing, empty: 'Nothing sent from this mailbox lately.' },
      { title: 'Incoming messages', emails: logs?.incoming, empty: 'Nothing received by this mailbox lately.' },
    ];
  });
}
