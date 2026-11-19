import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxApi, MailboxForward } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

/** The current dashboard's MailboxForwardingPage: copies of incoming mail to addresses on other domains. */
@Component({
  selector: 'amelu-mailbox-forwarding',
  imports: [RouterLink, Alert, EmptyState, Icon, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Forwarding">
      Send a copy of incoming mail to an address on another domain.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        <amelu-alert kind="warning" title="Spam isn't forwarded">
          Mail our filter marks as spam stays in this mailbox's Junk folder and isn't forwarded.
        </amelu-alert>

        @if (error(); as message) {
          <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
            {{ message }}
          </amelu-alert>
        }

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">
              Forwarding to
              @if (forwards(); as list) {
                <span class="font-normal text-muted">({{ list.length }})</span>
              }
            </h2>
            <button type="button" [class]="ui.setAction + ' cursor-pointer'" aria-label="New forwarding" title="New forwarding" (click)="destinationInput.focus()">
              <amelu-icon name="plus" [size]="18" />
            </button>
          </div>
          <div [class]="ui.well">
            @if (forwards() === null) {
              <amelu-empty-state class="rounded-md border border-line bg-surface" title="Forwards couldn't be loaded" [error]="true" [compact]="true" />
            } @else {
              <div [class]="ui.tableWrap">
                <table [class]="ui.table">
                  <thead>
                    <tr>
                      <th [class]="ui.th">Destination</th>
                      <th class="w-0 pr-4" aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @if (forwards(); as list) {
                      @for (forward of list; track forward.id) {
                        <tr [class]="ui.tr + ' hover:bg-bg/40'">
                          <td [class]="ui.td + ' max-w-[420px]'">
                            <span class="flex items-center gap-3">
                              <amelu-icon name="arrowRight" [size]="15" class="flex-none text-muted" />
                              <span class="min-w-0">
                                <span class="block truncate font-medium">{{ forward.destination }}</span>
                                <span [class]="ui.tdSub">Gets a copy of incoming mail</span>
                              </span>
                            </span>
                          </td>
                          <td class="w-0 pr-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              class="cursor-pointer text-[13px] text-bad hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-50"
                              [attr.aria-label]="'Stop forwarding to ' + forward.destination"
                              [disabled]="removing() === forward.id"
                              (click)="remove(forward)"
                            >
                              {{ removing() === forward.id ? 'Deleting...' : 'Delete' }}
                            </button>
                          </td>
                        </tr>
                      } @empty {
                        <tr [class]="ui.tr">
                          <td colspan="2" class="px-4 py-10 text-center">
                            <amelu-icon name="mail" [size]="18" class="mx-auto block" />
                            <p class="mt-2">Not forwarding yet</p>
                            <p class="mt-0.5 text-[13px] text-muted">Add an address below to start sending copies there.</p>
                          </td>
                        </tr>
                      }
                    } @else {
                      @for (i of [1, 2]; track i) {
                        <tr [class]="ui.tr" aria-hidden="true">
                          <td [class]="ui.td"><span class="flex items-center gap-3"><span class="size-4 animate-pulse rounded bg-bg"></span><span class="h-3 w-56 animate-pulse rounded bg-bg"></span></span></td>
                          <td></td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </section>

        <form [class]="ui.panel" (submit)="create($event)">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">New forwarding</h2>
          </div>
          <section class="p-4">
            <label for="forward-destination" class="block text-[15px] font-medium">Destination address</label>
            <input
              #destinationInput
              id="forward-destination"
              type="email"
              class="mt-3 h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[15px] outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25"
              placeholder="someone@example.com"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              required
              [value]="destination()"
              (input)="destination.set($any($event.target).value)"
            />
            <p class="mt-2 text-[12px] text-muted">An address on another domain.</p>

            <!-- Where incoming mail ends up once this is added. -->
            <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-well px-4 py-3 text-[13px]">
              <span class="font-mono text-[12px] text-muted">{{ ctx.mailbox()?.address ?? 'This mailbox' }}</span>
              <amelu-icon name="arrowRight" [size]="15" class="text-muted" />
              <span class="inline-flex items-center gap-1.5 font-medium"><amelu-icon name="inbox" [size]="15" class="flex-none text-link" />Kept here</span>
              <span class="text-muted">and</span>
              @if (destination().trim()) {
                <span class="inline-flex min-w-0 items-center gap-1.5 font-medium"><amelu-icon name="copy" [size]="15" class="flex-none text-link" /><span class="truncate">{{ destination().trim().toLowerCase() }}</span></span>
              } @else {
                <span class="inline-flex items-center gap-1.5 text-muted"><amelu-icon name="copy" [size]="15" class="flex-none" />a copy to the address above</span>
              }
            </div>
          </section>
          <div class="flex items-center gap-3 border-t border-line bg-well px-4 py-3">
            <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="creating()">
              {{ creating() ? 'Adding...' : 'Add forwarding' }}
            </button>
          </div>
        </form>
      </div>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Forwarding, aliases or delegation?</h2>
          </div>
          <div [class]="ui.well">
            <ul class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface text-[13px] leading-relaxed">
              <li class="px-4 py-2.5">Forwarding keeps the mail here and sends a copy to another domain.</li>
              <li class="px-4 py-2.5">Delegation moves the mail to other mailboxes on this domain instead.</li>
              <li class="px-4 py-2.5">An alias gives this mailbox an extra address.</li>
            </ul>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Related</h2>
          </div>
          <div [class]="ui.well">
            <ul class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              <li>
                <a [routerLink]="ctx.base() + '/delegation'" class="group flex items-center gap-3 px-4 py-2.5 hover:bg-bg/50">
                  <span class="min-w-0 flex-1">
                    <span class="block text-[13px] font-medium text-link group-hover:underline">Delegation</span>
                    <span class="mt-0.5 block text-[12px] text-muted">Hand mail to mailboxes on this domain</span>
                  </span>
                  <amelu-icon name="chevronRight" [size]="14" class="flex-none text-muted group-hover:text-ink" />
                </a>
              </li>
              <li>
                <a [routerLink]="'/domains/' + ctx.domainId() + '/aliases'" class="group flex items-center gap-3 px-4 py-2.5 hover:bg-bg/50">
                  <span class="min-w-0 flex-1">
                    <span class="block text-[13px] font-medium text-link group-hover:underline">Address aliases</span>
                    <span class="mt-0.5 block text-[12px] text-muted">Extra addresses for a mailbox</span>
                  </span>
                  <amelu-icon name="chevronRight" [size]="14" class="flex-none text-muted group-hover:text-ink" />
                </a>
              </li>
            </ul>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxForwarding {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly forwards = perMailbox((id) => this.api.forwards(id));
  protected readonly destination = signal('');
  protected readonly creating = signal(false);
  protected readonly removing = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private async reload(): Promise<void> {
    this.forwards.set(await firstValueFrom(this.api.forwards(this.ctx.id())));
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.creating.set(true);
    try {
      await firstValueFrom(this.api.createForward(this.ctx.id(), this.destination().trim()));
      this.destination.set('');
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not create forward'));
    } finally {
      this.creating.set(false);
    }
  }

  protected async remove(forward: MailboxForward): Promise<void> {
    this.error.set(null);
    this.removing.set(forward.id);
    try {
      await firstValueFrom(this.api.deleteForward(this.ctx.id(), forward.id));
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not remove forward'));
    } finally {
      this.removing.set(null);
    }
  }
}
