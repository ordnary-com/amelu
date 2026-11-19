import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { Identity, MailboxApi } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

/** The current dashboard's MailboxIdentitiesPage: names and addresses this mailbox sends as. */
@Component({
  selector: 'amelu-mailbox-identities',
  imports: [RouterLink, Alert, EmptyState, Icon, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Identities">
      Other names and addresses this mailbox can send as.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        @if (error(); as message) {
          <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
            {{ message }}
          </amelu-alert>
        }

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">
              Identities
              @if (identities(); as list) {
                <span class="font-normal text-muted">({{ list.length }})</span>
              }
            </h2>
            <button type="button" [class]="ui.setAction + ' cursor-pointer'" aria-label="New identity" title="New identity" (click)="nameInput.focus()">
              <amelu-icon name="plus" [size]="18" />
            </button>
          </div>
          <div [class]="ui.well">
            @if (identities() === null) {
              <amelu-empty-state class="rounded-md border border-line bg-surface" title="Identities couldn't be loaded" [error]="true" [compact]="true" />
            } @else {
              <div [class]="ui.tableWrap">
                <table [class]="ui.table">
                  <thead>
                    <tr>
                      <th [class]="ui.th">Name</th>
                      <th [class]="ui.th">Address</th>
                      <th class="w-0 pr-4" aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @if (identities(); as list) {
                      @for (identity of list; track identity.id) {
                        <tr [class]="ui.tr + ' hover:bg-bg/40'">
                          <td [class]="ui.td + ' max-w-[260px]'">
                            <span class="flex items-center gap-3">
                              <span class="flex size-7 flex-none items-center justify-center rounded-full bg-bg text-muted" aria-hidden="true">
                                <amelu-icon name="user" [size]="14" />
                              </span>
                              <span class="truncate font-medium" [class.text-muted]="!identity.name">{{ identity.name || 'No name' }}</span>
                            </span>
                          </td>
                          <td [class]="ui.td + ' max-w-[300px]'">
                            <span class="block truncate">{{ identity.email }}</span>
                          </td>
                          <td class="w-0 pr-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              class="cursor-pointer text-[13px] text-bad hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-50"
                              [attr.aria-label]="'Delete ' + identity.email"
                              [disabled]="removing() === identity.id"
                              (click)="remove(identity)"
                            >
                              {{ removing() === identity.id ? 'Deleting...' : 'Delete' }}
                            </button>
                          </td>
                        </tr>
                      } @empty {
                        <tr [class]="ui.tr">
                          <td colspan="3" class="px-4 py-10 text-center">
                            <amelu-icon name="user" [size]="18" class="mx-auto block" />
                            <p class="mt-2">No identities yet</p>
                            <p class="mt-0.5 text-[13px] text-muted">Add one below to send under another name or address.</p>
                          </td>
                        </tr>
                      }
                    } @else {
                      @for (i of [1, 2]; track i) {
                        <tr [class]="ui.tr" aria-hidden="true">
                          <td [class]="ui.td"><span class="flex items-center gap-3"><span class="size-7 animate-pulse rounded-full bg-bg"></span><span class="h-3 w-32 animate-pulse rounded bg-bg"></span></span></td>
                          <td [class]="ui.td"><span class="block h-3 w-48 animate-pulse rounded bg-bg"></span></td>
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
            <h2 [class]="ui.panelTitle">New identity</h2>
          </div>
          <section class="p-4">
            <label for="identity-name" [class]="sectionTitle">Name</label>
            <input
              #nameInput
              id="identity-name"
              [class]="field"
              placeholder="Support team"
              autocomplete="off"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
            <p class="mt-2 text-[12px] text-muted">Shown to recipients next to the address. Optional.</p>
          </section>
          <section class="border-t border-line p-4">
            <label for="identity-email" [class]="sectionTitle">Address</label>
            <input
              id="identity-email"
              type="email"
              [class]="field"
              [placeholder]="'support@' + (domain() || 'yourdomain.tld')"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              required
              [value]="email()"
              (input)="email.set($any($event.target).value)"
            />
            <p class="mt-2 text-[12px] text-muted">Must be this mailbox's own address or one of its aliases.</p>
          </section>
          <div class="flex items-center gap-3 border-t border-line bg-well px-4 py-3">
            <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="creating()">
              {{ creating() ? 'Adding...' : 'Add identity' }}
            </button>
          </div>
        </form>
      </div>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Sending as an alias</h2>
            <a [routerLink]="'/domains/' + ctx.domainId() + '/aliases'" class="text-[13px] text-link hover:underline">Address aliases</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Create an alias that delivers to this mailbox first, then add it here so replies can come from that address too.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">In a mail app</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Most mail apps need the identity added on their side too, as an extra "From" address that signs in with this mailbox.
            </p>
          </div>
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
  // The same big form fields as New mailbox.
  protected readonly sectionTitle = 'block text-[15px] font-medium';
  protected readonly field =
    'mt-3 h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[15px] outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25';
  protected readonly domain = computed(() => this.ctx.mailbox()?.address.split('@')[1] ?? '');

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
