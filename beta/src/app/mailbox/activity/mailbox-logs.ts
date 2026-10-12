import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

/** The current dashboard's MailboxRecentLogsPage: the latest sent and received messages. */
@Component({
  selector: 'amelu-mailbox-logs',
  imports: [DatePipe, RouterLink, EmptyState, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Recent traffic logs">The 20 most recent messages this mailbox sent and received.</amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        @if (logs() === null) {
          <amelu-empty-state [class]="ui.card" title="The traffic logs couldn't be loaded" [error]="true" />
        } @else {
          @for (section of sections(); track section.title) {
            <section>
              <h2 [class]="ui.sectionTitle">{{ section.title }}</h2>
              <div [class]="ui.card + ' overflow-x-auto'">
                @if (section.emails; as emails) {
                  @if (emails.length) {
                    <table class="w-full min-w-[560px] text-left text-[13px]">
                      <thead class="text-[12px] text-muted">
                        <tr class="border-b border-line">
                          <th class="px-4 py-2 font-medium">Date</th>
                          <th class="px-4 py-2 font-medium">From</th>
                          <th class="px-4 py-2 font-medium">To</th>
                          <th class="px-4 py-2 font-medium">Subject</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (email of emails; track email.id) {
                          <tr class="border-b border-line align-top last:border-b-0 hover:bg-bg/60">
                            <td class="px-4 py-2.5 whitespace-nowrap text-muted tabular-nums">{{ email.receivedAt | date: 'd MMM y, HH:mm' }}</td>
                            <td class="px-4 py-2.5 break-all">{{ email.from?.join(', ') }}</td>
                            <td class="px-4 py-2.5 break-all">{{ email.to?.join(', ') }}</td>
                            <td class="px-4 py-2.5">
                              @if (email.subject) {
                                {{ email.subject }}
                              } @else {
                                <span class="text-muted">(no subject)</span>
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  } @else {
                    <amelu-empty-state title="No recent messages" [compact]="true">{{ section.empty }}</amelu-empty-state>
                  }
                } @else {
                  @for (i of [1, 2, 3]; track i) {
                    <div class="flex gap-4 border-b border-line px-4 py-3 last:border-b-0" aria-hidden="true">
                      <span class="h-3 w-24 animate-pulse rounded bg-bg"></span>
                      <span class="h-3 w-40 animate-pulse rounded bg-bg"></span>
                      <span class="h-3 flex-1 animate-pulse rounded bg-bg"></span>
                    </div>
                  }
                }
              </div>
            </section>
          }
        }
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Where this comes from</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Outgoing messages are read from the Sent folder and incoming ones from the Inbox, so a message the user has
            deleted or moved isn't listed.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Missing mail?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Spam lands in the Junk folder instead. Also check whether forwarding or delegation sends it elsewhere.
          </p>
          <div class="mt-2.5 flex gap-4 text-[13px] font-medium">
            <a [routerLink]="ctx.base() + '/forwarding'" class="text-link hover:underline">Forwarding</a>
            <a [routerLink]="ctx.base() + '/delegation'" class="text-link hover:underline">Delegation</a>
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
