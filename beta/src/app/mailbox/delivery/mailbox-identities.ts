import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { UI } from '../../ui';
import { Identity, MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

/** The current dashboard's MailboxIdentitiesPage: names and addresses this mailbox sends as. */
@Component({
  selector: 'amelu-mailbox-identities',
  imports: [RouterLink, Alert, EmptyState, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Identities">
      Identities serve as alternative addresses you can use to represent yourself when sending and receiving.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        @if (error(); as message) {
          <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
            {{ message }}
          </amelu-alert>
        }

        <section>
          <h2 [class]="ui.sectionTitle">Identities</h2>
          <div [class]="ui.card + ' overflow-hidden'">
            @if (identities(); as list) {
              @for (identity of list; track identity.id) {
                <div class="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-bg/60">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-[14px]" [class.text-muted]="!identity.name">{{ identity.name || 'No name' }}</div>
                    <div class="truncate text-[12px] text-muted">{{ identity.email }}</div>
                  </div>
                  <button
                    type="button"
                    class="h-7 flex-none cursor-pointer rounded-md px-2.5 text-[12px] font-medium text-bad hover:bg-bad/10 disabled:cursor-default disabled:opacity-50"
                    [disabled]="removing() === identity.id"
                    (click)="remove(identity)"
                  >
                    {{ removing() === identity.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
              } @empty {
                <amelu-empty-state title="No identities yet">Add one below to send under another name or address.</amelu-empty-state>
              }
            } @else if (identities() === null) {
              <amelu-empty-state title="Identities couldn't be loaded" [error]="true" />
            } @else {
              @for (i of [1, 2]; track i) {
                <div class="space-y-2 border-b border-line px-4 py-3 last:border-b-0" aria-hidden="true">
                  <span class="block h-3 w-32 animate-pulse rounded bg-bg"></span>
                  <span class="block h-3 w-56 animate-pulse rounded bg-bg"></span>
                </div>
              }
            }
          </div>
        </section>

        <section>
          <h2 [class]="ui.sectionTitle">New identity</h2>
          <form [class]="ui.card + ' space-y-4 p-4'" (submit)="create($event)">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span [class]="ui.label">Name</span>
                <input [class]="ui.input" placeholder="eg. Support team" [value]="name()" (input)="name.set($any($event.target).value)" />
              </label>
              <label class="block">
                <span [class]="ui.label">Address</span>
                <input
                  type="email"
                  [class]="ui.input"
                  placeholder="eg. support@yourdomain.tld"
                  required
                  [value]="email()"
                  (input)="email.set($any($event.target).value)"
                />
              </label>
            </div>
            <p [class]="ui.hint + ' mt-0'">
              The address must be one this mailbox already owns: either its own address or an existing alias of it.
            </p>
            <button type="submit" [class]="ui.primary" [disabled]="creating()">
              {{ creating() ? 'Adding...' : 'New identity' }}
            </button>
          </form>
        </section>
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Sending as an alias</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Create an alias that delivers to this mailbox first, then add it here as an identity so replies can come
            from that address too.
          </p>
          <a [routerLink]="'/domains/' + ctx.domainId() + '/aliases'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Address aliases
          </a>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">In a mail app</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Most mail apps still need the identity added on their side as an extra "From" address, using this mailbox's
            own sign-in.
          </p>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxIdentities {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;

  protected readonly identities = perMailbox((id) => this.api.identities(id));
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly creating = signal(false);
  protected readonly removing = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private async reload(): Promise<void> {
    this.identities.set(await firstValueFrom(this.api.identities(this.ctx.id())));
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.creating.set(true);
    try {
      await firstValueFrom(this.api.createIdentity(this.ctx.id(), this.name().trim(), this.email().trim()));
      this.name.set('');
      this.email.set('');
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not create identity'));
    } finally {
      this.creating.set(false);
    }
  }

  protected async remove(identity: Identity): Promise<void> {
    this.error.set(null);
    this.removing.set(identity.id);
    try {
      await firstValueFrom(this.api.deleteIdentity(this.ctx.id(), identity.id));
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not remove identity'));
    } finally {
      this.removing.set(null);
    }
  }
}
