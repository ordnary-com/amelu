import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, ConnectRequest, ConnectTargets, errorMessage } from '../api';
import { Session } from '../session';
import { ConnectState, ConnectView } from './connect-view';

/** /connect, where an AI assistant such as ChatGPT sends the customer to approve access to one mailbox. */
@Component({
  selector: 'amelu-connect',
  imports: [ConnectView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <amelu-connect-view
      [state]="state()"
      [request]="request()"
      [message]="failure()"
      [account]="account()"
      [busy]="busy()"
      [error]="error()"
      [(targets)]="targets"
      [(granted)]="granted"
      (approved)="submit(false)"
      (denied)="submit(true)"
    />
  `,
})
export class Connect {
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  protected readonly account = computed(() => this.session.customer()?.email ?? null);

  protected readonly state = signal<ConnectState>('loading');
  protected readonly request = signal<ConnectRequest | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly targets = signal<ConnectTargets>({ all: false, domainIds: [], mailboxIds: [] });
  // Send is never pre-ticked, even when the app asks for it.
  protected readonly granted = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const clientId = this.params.get('client_id');
    const redirectUri = this.params.get('redirect_uri');
    if (!clientId || !redirectUri || !this.params.get('code_challenge')) {
      this.fail('The link is incomplete. Start the connection again from the app.');
      return;
    }
    try {
      const req = await firstValueFrom(this.api.getConnectRequest(clientId, redirectUri, this.params.get('scope') ?? ''));
      this.request.set(req);
      // A single mailbox is preselected; with several, the customer chooses.
      const all = req.domains.flatMap((d) => d.mailboxes);
      if (all.length === 1) this.targets.set({ all: false, domainIds: [], mailboxIds: [all[0].id] });
      this.granted.set(req.scopes.filter((s) => s !== 'mail.send'));
      if (!req.allowed) {
        this.fail('Only owners and admins of an organization can give an app access to a mailbox.', 'denied');
      } else if (req.domains.every((d) => d.mailboxes.length === 0)) {
        this.fail('Create a mailbox first, then start the connection again from the app.', 'empty');
      } else {
        this.state.set('ready');
      }
    } catch (err) {
      this.fail(errorMessage(err, 'Could not load the request.'));
    }
  }

  private fail(message: string, state: ConnectState = 'failed'): void {
    this.failure.set(message);
    this.state.set(state);
  }

  protected async submit(deny: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { redirectUrl } = await firstValueFrom(
        this.api.approveConnect({
          clientId: this.params.get('client_id') ?? '',
          redirectUri: this.params.get('redirect_uri') ?? '',
          state: this.params.get('state') ?? '',
          codeChallenge: this.params.get('code_challenge') ?? '',
          targets: this.targets(),
          scopes: this.granted(),
          deny,
        }),
      );
      this.state.set('redirecting');
      window.location.assign(redirectUrl);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not complete the connection.'));
      this.busy.set(false);
    }
  }
}
