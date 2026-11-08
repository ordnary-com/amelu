import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';

/** The current dashboard's MailboxRecentLogsPage: the latest sent and received messages. */
@Component({
  selector: 'amelu-mailbox-logs',
  imports: [DatePipe, RouterLink, EmptyState, MailboxHeading, Icon, DitherShader],
  template: `
    <amelu-mailbox-heading title="Recent traffic logs">The 20 most recent messages this mailbox sent and received.</amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        @if (logs() === null) {
          <amelu-empty-state [class]="ui.card" title="The traffic logs couldn't be loaded" [error]="true" />
        } @else {
          @for (section of sections(); track section.title) {
            <section>
              <h2 class="mb-3 flex items-center gap-2 text-[14px] font-bold">
                {{ section.title }}
                @if (section.emails) {
                  <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ section.emails.length }}</span>
                }
              </h2>
              <div [class]="ui.card + ' overflow-x-auto'">
                @if (section.emails; as emails) {
                  @if (emails.length) {
                    <table class="w-full min-w-[560px] text-left text-[13px]">
                      <thead class="bg-bg/60 text-[12px] text-muted">
                        <tr class="border-b border-line">
                          <th class="px-4 py-2 font-medium">Date</th>
                          <th class="px-4 py-2 font-medium">From</th>
                          <th class="px-4 py-2 font-medium">To</th>
                          <th class="px-4 py-2 font-medium">Subject</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-line">
                        @for (email of emails; track email.id) {
                          <tr class="align-top hover:bg-bg/60">
                            <td class="px-4 py-2.5 whitespace-nowrap text-muted tabular-nums" [title]="email.receivedAt | date: 'd MMM y, HH:mm:ss'">{{ email.receivedAt | date: 'd MMM y, HH:mm' }}</td>
                            <td class="px-4 py-2.5 font-mono text-[12px] break-all">{{ email.from?.join(', ') }}</td>
                            <td class="px-4 py-2.5 font-mono text-[12px] break-all">{{ email.to?.join(', ') }}</td>
                            <td class="px-4 py-2.5 break-words">
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
                  <div class="divide-y divide-line" aria-hidden="true">
                  @for (i of [1, 2, 3]; track i) {
                    <div class="flex gap-4 px-4 py-3">
                      <span class="h-3 w-24 animate-pulse rounded bg-bg"></span>
                      <span class="h-3 w-40 animate-pulse rounded bg-bg"></span>
                      <span class="h-3 flex-1 animate-pulse rounded bg-bg"></span>
                    </div>
                  }
                  </div>
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
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="search" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Missing mail?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Spam lands in the Junk folder instead. Also check whether forwarding or delegation sends it elsewhere.
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a [routerLink]="ctx.base() + '/forwarding'" class="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-[13px] font-medium hover:border-ink/20 hover:bg-bg">Forwarding</a>
            <a [routerLink]="ctx.base() + '/delegation'" class="text-[13px] font-medium text-link hover:underline">Delegation</a>
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
