import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';
import { UI } from '../../ui';
import { MailboxApi, MailboxForward } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

/** The current dashboard's MailboxForwardingPage: copies of incoming mail to addresses on other domains. */
@Component({
  selector: 'amelu-mailbox-forwarding',
  imports: [RouterLink, Alert, DitherShader, EmptyState, Icon, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Forwarding">
      Forwarding sends a copy of incoming messages of this mailbox to an address on another domain. To forward to an
      address on this same domain, use aliases or delegation instead.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        <amelu-alert kind="warning" title="Spam isn't forwarded">
          If an incoming message is considered spam by our filter, it will not be forwarded further. A copy is placed in
          the Junk folder of this mailbox instead.
        </amelu-alert>

        @if (error(); as message) {
          <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
            {{ message }}
          </amelu-alert>
        }

        <section>
          <h2 [class]="ui.sectionTitle + ' flex items-center gap-2'">
            Forwarding to
            @if (forwards(); as list) {
              <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ list.length }}</span>
            }
          </h2>
          <div [class]="ui.card + ' overflow-hidden'">
            @if (forwards(); as list) {
              <ul class="divide-y divide-line">
                @for (forward of list; track forward.id) {
                  <li class="flex items-center gap-3 px-4 py-3 hover:bg-bg/60">
                    <span class="inline-flex size-8 flex-none items-center justify-center rounded-full bg-bg text-muted" aria-hidden="true">
                      <amelu-icon name="mail" [size]="14" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-[14px] font-medium">{{ forward.destination }}</div>
                      <div class="truncate text-[12px] text-muted">Receives copies of incoming mail</div>
                    </div>
                    <button
                      type="button"
                      class="h-7 flex-none cursor-pointer rounded-md px-2.5 text-[12px] font-medium text-bad hover:bg-bad/10 disabled:cursor-default disabled:opacity-50"
                      [disabled]="removing() === forward.id"
                      (click)="remove(forward)"
                    >
                      {{ removing() === forward.id ? 'Deleting...' : 'Delete' }}
                    </button>
                  </li>
                } @empty {
                  <li>
                    <amelu-empty-state title="Not forwarding yet" illustration="message-sent">Add an address below to start sending copies there.</amelu-empty-state>
                  </li>
                }
              </ul>
            } @else if (forwards() === null) {
              <amelu-empty-state title="Forwards couldn't be loaded" [error]="true" />
            } @else {
              <ul class="divide-y divide-line" aria-hidden="true">
                @for (i of [1, 2]; track i) {
                  <li class="flex items-center gap-3 px-4 py-3">
                    <span class="size-8 flex-none animate-pulse rounded-full bg-bg"></span>
                    <span class="block h-3 w-56 animate-pulse rounded bg-bg"></span>
                  </li>
                }
              </ul>
            }
          </div>
        </section>

        <section>
          <h2 [class]="ui.sectionTitle">New forwarding</h2>
          <form [class]="ui.card + ' space-y-4 p-4'" (submit)="create($event)">
            <label class="block">
              <span [class]="ui.label">Destination address</span>
              <input
                type="email"
                [class]="ui.input"
                placeholder="For example: someone@example.com"
                required
                [value]="destination()"
                (input)="destination.set($any($event.target).value)"
              />
              <span [class]="ui.hint + ' block'">An address on another domain. Mail keeps arriving here as well.</span>
            </label>
            <div class="-mx-4 -mb-4 flex justify-end border-t border-line bg-bg/40 px-4 py-3">
              <button type="submit" [class]="ui.primary" [disabled]="creating()">
                {{ creating() ? 'Adding...' : 'New forwarding' }}
              </button>
            </div>
          </form>
        </section>
      </div>

      <aside class="space-y-6">
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="mail" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Forwarding, aliases or delegation?</h2>
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
          <div class="mt-3 flex flex-wrap gap-2">
            <a [routerLink]="ctx.base() + '/delegation'" [class]="ui.outline">Delegation</a>
            <a [routerLink]="'/domains/' + ctx.domainId() + '/aliases'" [class]="ui.outline">Aliases</a>
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
