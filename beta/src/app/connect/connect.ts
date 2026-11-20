import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, ConnectRequest, errorMessage } from '../api';
import { Icon } from '../icon';
import { TokenFrame, tokenUi } from '../token-pages/token-frame';

const SCOPE_LABELS: Record<string, { title: string; hint: string }> = {
  'mail.read': { title: 'Read mail', hint: 'See messages in the inbox and sent folders.' },
  'mail.draft': { title: 'Write drafts', hint: 'Save drafts in the Drafts folder. Nothing is sent.' },
  'mail.send': { title: 'Send mail', hint: 'Send email as this mailbox without asking you first. This cannot be undone.' },
};

/** /connect, where an AI assistant such as ChatGPT sends the customer to approve access to one mailbox. */
@Component({
  selector: 'amelu-connect',
  imports: [TokenFrame, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amelu-token-frame>
      @if (request(); as req) {
        @if (!req.allowed) {
          <span [class]="ui.mark + ' bg-bad/15 text-bad'" aria-hidden="true"><amelu-icon name="circleAlert" [size]="18" /></span>
          <h1 [class]="ui.title">You can't connect a mailbox</h1>
          <p [class]="ui.text">Only owners and admins of an organization can give an app access to a mailbox.</p>
        } @else if (req.mailboxes.length === 0) {
          <h1 [class]="ui.title">No mailbox to connect</h1>
          <p [class]="ui.text">Create a mailbox first, then start the connection again.</p>
        } @else {
          <span [class]="ui.mark + ' bg-white/10'" aria-hidden="true"><amelu-icon name="mail" [size]="18" /></span>
          <h1 [class]="ui.title">Connect {{ req.clientName }} to a mailbox</h1>
          <p [class]="ui.text">
            {{ req.clientName }} ({{ req.redirectHost }}) is asking for access to one of your mailboxes. You can
            disconnect it at any time under My Account.
          </p>

          <form class="mt-8" (submit)="approve($event)">
            <label for="mailbox" [class]="ui.label">Mailbox</label>
            <select id="mailbox" [class]="ui.input" (change)="mailboxId.set($any($event.target).value)">
              @for (m of req.mailboxes; track m.id) {
                <option [value]="m.id" [selected]="m.id === mailboxId()">{{ m.address }}</option>
              }
            </select>

            <fieldset class="mt-6 space-y-3">
              <legend [class]="ui.label">Allow it to</legend>
              @for (scope of req.scopes; track scope) {
                <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 px-3 py-2.5">
                  <input type="checkbox" class="mt-1" [checked]="granted().includes(scope)" (change)="toggle(scope, $any($event.target).checked)" />
                  <span>
                    <span class="block text-[14px] font-medium">{{ label(scope).title }}</span>
                    <span class="block text-[13px] text-[#a4a4ac]">{{ label(scope).hint }}</span>
                  </span>
                </label>
              }
            </fieldset>

            @if (error(); as message) {
              <p [class]="ui.error" role="alert">{{ message }}</p>
            }
            <button type="submit" [class]="ui.button" [disabled]="busy() || granted().length === 0">Allow access</button>
            <button type="button" class="mt-3 h-11 w-full cursor-pointer rounded-full text-[14px] text-[#a4a4ac] hover:text-white" [disabled]="busy()" (click)="deny()">Cancel</button>
          </form>
        }
      } @else if (failed(); as message) {
        <span [class]="ui.mark + ' bg-bad/15 text-bad'" aria-hidden="true"><amelu-icon name="circleAlert" [size]="18" /></span>
        <h1 [class]="ui.title">This connection can't be set up</h1>
        <p [class]="ui.text">{{ message }}</p>
      } @else {
        <p [class]="ui.text">Loading…</p>
      }
    </amelu-token-frame>
  `,
})
export class Connect {
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly api = inject(Api);
  protected readonly ui = tokenUi;

  protected readonly request = signal<ConnectRequest | null>(null);
  protected readonly failed = signal<string | null>(null);
  protected readonly mailboxId = signal('');
  // Send is never pre-ticked, even when the app asks for it.
  protected readonly granted = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected label(scope: string): { title: string; hint: string } {
    return SCOPE_LABELS[scope] ?? { title: scope, hint: '' };
  }

  private async load(): Promise<void> {
    const clientId = this.params.get('client_id');
    const redirectUri = this.params.get('redirect_uri');
    if (!clientId || !redirectUri || !this.params.get('code_challenge')) {
      this.failed.set('The link is incomplete. Start the connection again from the app.');
      return;
    }
    try {
      const req = await firstValueFrom(this.api.getConnectRequest(clientId, redirectUri, this.params.get('scope') ?? ''));
      this.mailboxId.set(req.mailboxes[0]?.id ?? '');
      this.granted.set(req.scopes.filter((s) => s !== 'mail.send'));
      this.request.set(req);
    } catch (err) {
      this.failed.set(errorMessage(err, 'Could not load the request.'));
    }
  }

  protected toggle(scope: string, on: boolean): void {
    this.granted.update((list) => (on ? [...list, scope] : list.filter((s) => s !== scope)));
  }

  protected approve(event: Event): Promise<void> {
    event.preventDefault();
    return this.submit(false);
  }

  protected deny(): Promise<void> {
    return this.submit(true);
  }

  private async submit(deny: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { redirectUrl } = await firstValueFrom(
        this.api.approveConnect({
          clientId: this.params.get('client_id') ?? '',
          redirectUri: this.params.get('redirect_uri') ?? '',
          state: this.params.get('state') ?? '',
          codeChallenge: this.params.get('code_challenge') ?? '',
          mailboxId: this.mailboxId(),
          scopes: this.granted(),
          deny,
        }),
      );
      window.location.assign(redirectUrl);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not complete the connection.'));
      this.busy.set(false);
    }
  }
}
