import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Api, Connector, errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { UI } from '../ui';
import { Icon } from '../icon';

const SCOPE_NAMES: Record<string, string> = { 'mail.read': 'Read', 'mail.draft': 'Draft', 'mail.send': 'Send' };

/** My Account > Connected apps: AI assistants a mailbox has been shared with. */
@Component({
  selector: 'amelu-account-connectors',
  imports: [DatePipe, Alert, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '(document:keydown.escape)': 'closeRevoke()' },
  template: `
    <div class="space-y-5">
      @if (error(); as message) {
        <amelu-alert kind="error" title="Something went wrong" [dismissible]="true" (dismissed)="error.set(null)">
          {{ message }}
        </amelu-alert>
      }

      <section [class]="ui.setCard">
        <div [class]="ui.setHeader">
          <h2 [class]="ui.setTitle">
            Connected Apps
            @if (connectors(); as list) {
              <span class="font-normal text-muted">({{ list.length }})</span>
            }
          </h2>
        </div>
        <div [class]="ui.well">
          <div [class]="ui.tableWrap">
            <table [class]="ui.table">
              <thead>
                <tr>
                  <th [class]="ui.th">App</th>
                  <th [class]="ui.th">Mailbox</th>
                  <th [class]="ui.th + ' max-md:hidden'">Can</th>
                  <th [class]="ui.th + ' max-md:hidden'">Last used</th>
                  <th class="w-0 pr-4"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (c of connectors(); track c.id) {
                  <tr [class]="ui.tr">
                    <td [class]="ui.td + ' font-medium'">{{ c.clientName }}</td>
                    <td [class]="ui.td">{{ c.mailbox }}</td>
                    <td [class]="ui.td + ' max-md:hidden'">{{ scopeList(c) }}</td>
                    <td [class]="ui.td + ' whitespace-nowrap max-md:hidden'">
                      @if (c.lastUsedAt) {
                        {{ c.lastUsedAt | date: 'd MMM y, HH:mm' }}
                      } @else {
                        <span class="text-muted">Never</span>
                      }
                    </td>
                    <td class="w-0 pr-4 text-right">
                      <button type="button" class="cursor-pointer text-[13px] text-bad hover:underline" (click)="revokeTarget.set(c)">Disconnect</button>
                    </td>
                  </tr>
                } @empty {
                  @if (connectors() !== undefined) {
                    <tr [class]="ui.tr">
                      <td colspan="5" class="px-4 py-8 text-center">
                        <amelu-icon name="mail" [size]="18" class="mx-auto block" />
                        <p class="mt-2">No connected apps</p>
                        <p class="mt-0.5 text-[13px] text-muted">Add Amelu as a connector in an AI assistant such as ChatGPT to give it access to one mailbox.</p>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
        <p [class]="ui.setNote">
          <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
          <span>An app only sees the one mailbox you chose and can only do what you allowed. Disconnecting stops it immediately.</span>
        </p>
      </section>

      <section [class]="ui.setCard">
        <div [class]="ui.setHeader">
          <h2 [class]="ui.setTitle">Connecting ChatGPT</h2>
        </div>
        <div class="px-5 py-4">
          <p class="text-[13px] text-muted">Add a custom connector with this address</p>
          <code class="mt-1 block truncate font-mono text-[15px]">{{ mcpUrl }}</code>
        </div>
        <p [class]="ui.setNote">
          <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
          <span>ChatGPT will send you here to choose a mailbox and what it may do. Reading mail and writing drafts is the safe default. Think before allowing it to send.</span>
        </p>
      </section>
    </div>

    @if (revokeTarget(); as target) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="closeRevoke()">
        <div class="w-full max-w-md rounded-md border border-line bg-popover p-5 shadow-xl" role="alertdialog" aria-modal="true" (click)="$event.stopPropagation()">
          <h3 class="text-[15px] font-bold">Disconnect {{ target.clientName }}?</h3>
          <p class="mt-2 text-[13px] leading-relaxed text-muted">
            It loses access to {{ target.mailbox }} immediately. You can connect it again later.
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" [class]="ui.outline" (click)="closeRevoke()" [disabled]="revoking()">Cancel</button>
            <button type="button" [class]="ui.danger" (click)="confirmRevoke()" [disabled]="revoking()">
              {{ revoking() ? 'Disconnecting...' : 'Disconnect' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AccountConnectors {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly mcpUrl = 'https://api.amelu.org/mcp';

  protected readonly connectors = signal<Connector[] | undefined>(undefined);
  protected readonly error = signal<string | null>(null);
  protected readonly revokeTarget = signal<Connector | null>(null);
  protected readonly revoking = signal(false);

  constructor() {
    void this.reload();
  }

  protected scopeList(c: Connector): string {
    return c.scopes.map((s) => SCOPE_NAMES[s] ?? s).join(', ');
  }

  private async reload(): Promise<void> {
    try {
      this.connectors.set(await firstValueFrom(this.api.listConnectors()));
    } catch (err) {
      this.connectors.set([]);
      this.error.set(errorMessage(err, 'Could not load connected apps'));
    }
  }

  protected closeRevoke(): void {
    if (!this.revoking()) this.revokeTarget.set(null);
  }

  protected async confirmRevoke(): Promise<void> {
    const target = this.revokeTarget();
    if (!target) return;
    this.revoking.set(true);
    try {
      await firstValueFrom(this.api.revokeConnector(target.id));
      this.revokeTarget.set(null);
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not disconnect the app'));
    } finally {
      this.revoking.set(false);
    }
  }
}
