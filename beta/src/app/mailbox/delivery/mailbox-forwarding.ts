import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { MailboxApi, MailboxForward } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

/** The current dashboard's MailboxForwardingPage: copies of incoming mail to addresses on other domains. */
@Component({
  selector: 'amelu-mailbox-forwarding',
  imports: [RouterLink, Alert, EmptyState, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Forwarding">
      Forwarding sends a copy of incoming messages of this mailbox to an address on another domain. To forward to an
      address on this same domain, use aliases or delegation instead.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        <amelu-alert kind="warning" title="Important">
          If an incoming message is considered spam by our filter, it will not be forwarded further. A copy is placed in
          the Junk folder of this mailbox instead.
        </amelu-alert>

        @if (error(); as message) {
          <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
            {{ message }}
          </amelu-alert>
        }

        <section>
          <h2 [class]="ui.sectionTitle">Forwarding to</h2>
          <div [class]="ui.card + ' overflow-hidden'">
            @if (forwards(); as list) {
              @for (forward of list; track forward.id) {
                <div class="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-bg/60">
                  <span class="min-w-0 flex-1 truncate text-[14px]">{{ forward.destination }}</span>
                  <button
                    type="button"
                    class="h-7 flex-none cursor-pointer rounded-md px-2.5 text-[12px] font-medium text-bad hover:bg-bad/10 disabled:cursor-default disabled:opacity-50"
                    [disabled]="removing() === forward.id"
                    (click)="remove(forward)"
                  >
                    {{ removing() === forward.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
              } @empty {
                <amelu-empty-state title="Not forwarding yet" illustration="message-sent">Add an address below to start sending copies there.</amelu-empty-state>
              }
            } @else if (forwards() === null) {
              <amelu-empty-state title="Forwards couldn't be loaded" [error]="true" />
            } @else {
              @for (i of [1, 2]; track i) {
                <div class="border-b border-line px-4 py-3.5 last:border-b-0" aria-hidden="true">
                  <span class="block h-3 w-56 animate-pulse rounded bg-bg"></span>
                </div>
              }
            }
          </div>
        </section>

        <section>
          <h2 [class]="ui.sectionTitle">New forwarding</h2>
          <form [class]="ui.card + ' flex flex-wrap items-end gap-3 p-4'" (submit)="create($event)">
            <label class="min-w-56 flex-1">
              <span [class]="ui.label">Destination address</span>
              <input
                type="email"
                [class]="ui.input"
                placeholder="eg. someone@example.com"
                required
                [value]="destination()"
                (input)="destination.set($any($event.target).value)"
              />
            </label>
            <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="creating()">
              {{ creating() ? 'Adding...' : 'New forwarding' }}
            </button>
          </form>
        </section>
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Forwarding, aliases or delegation?</h2>
          <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-accent"></span>
              Forwarding keeps the mail here and sends a copy to another domain.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              Delegation moves the mail to other mailboxes on this domain instead.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              An alias gives this mailbox an extra address.
            </li>
          </ul>
          <div class="mt-2.5 flex gap-4 text-[13px] font-medium">
            <a [routerLink]="ctx.base() + '/delegation'" class="text-link hover:underline">Delegation</a>
            <a [routerLink]="'/domains/' + ctx.domainId() + '/aliases'" class="text-link hover:underline">Aliases</a>
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
