import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';
import { UI } from '../../ui';
import { Identity, MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

/** The current dashboard's MailboxIdentitiesPage: names and addresses this mailbox sends as. */
@Component({
  selector: 'amelu-mailbox-identities',
  imports: [RouterLink, Alert, DitherShader, EmptyState, Icon, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Identities">
      Identities serve as alternative addresses you can use to represent yourself when sending and receiving.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="min-w-0 space-y-6">
        @if (error(); as message) {
          <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
            {{ message }}
          </amelu-alert>
        }

        <section>
          <h2 [class]="ui.sectionTitle + ' flex items-center gap-2'">
            Identities
            @if (identities(); as list) {
              <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ list.length }}</span>
            }
          </h2>
          <div [class]="ui.card + ' overflow-hidden'">
            @if (identities(); as list) {
              <ul class="divide-y divide-line">
                @for (identity of list; track identity.id) {
                  <li class="flex items-center gap-3 px-4 py-3 hover:bg-bg/60">
                    <span class="inline-flex size-8 flex-none items-center justify-center rounded-full bg-bg text-muted" aria-hidden="true">
                      <amelu-icon name="user" [size]="14" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-[14px] font-medium" [class.text-muted]="!identity.name">{{ identity.name || 'No name' }}</div>
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
                  </li>
                } @empty {
                  <li>
                    <amelu-empty-state title="No identities yet" illustration="profile">Add one below to send under another name or address.</amelu-empty-state>
                  </li>
                }
              </ul>
            } @else if (identities() === null) {
              <amelu-empty-state title="Identities couldn't be loaded" [error]="true" />
            } @else {
              <ul class="divide-y divide-line" aria-hidden="true">
                @for (i of [1, 2]; track i) {
                  <li class="flex items-center gap-3 px-4 py-3">
                    <span class="size-8 flex-none animate-pulse rounded-full bg-bg"></span>
                    <span class="space-y-2">
                      <span class="block h-3 w-32 animate-pulse rounded bg-bg"></span>
                      <span class="block h-3 w-56 animate-pulse rounded bg-bg"></span>
                    </span>
                  </li>
                }
              </ul>
            }
          </div>
        </section>

        <section>
          <h2 [class]="ui.sectionTitle">New identity</h2>
          <form [class]="ui.card + ' space-y-4 p-4'" (submit)="create($event)">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span [class]="ui.label">Name</span>
                <input [class]="ui.input" placeholder="For example: Support team" [value]="name()" (input)="name.set($any($event.target).value)" />
              </label>
              <label class="block">
                <span [class]="ui.label">Address</span>
                <input
                  type="email"
                  [class]="ui.input"
                  placeholder="For example: support@yourdomain.tld"
                  required
                  [value]="email()"
                  (input)="email.set($any($event.target).value)"
                />
              </label>
            </div>
            <p [class]="ui.hint + ' mt-0'">
              The address must be one this mailbox already owns: either its own address or an existing alias of it.
            </p>
            <div class="-mx-4 -mb-4 flex justify-end border-t border-line bg-bg/40 px-4 py-3">
              <button type="submit" [class]="ui.primary" [disabled]="creating()">
                {{ creating() ? 'Adding...' : 'New identity' }}
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
          <amelu-icon name="user" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Sending as an alias</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Create an alias that delivers to this mailbox first, then add it here as an identity so replies can come
            from that address too.
          </p>
          <a [routerLink]="'/domains/' + ctx.domainId() + '/aliases'" [class]="ui.outline + ' mt-3'">Address aliases</a>
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
