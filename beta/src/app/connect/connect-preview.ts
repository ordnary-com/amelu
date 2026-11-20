import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ConnectDomain, ConnectRequest, ConnectTargets } from '../api';
import { Theme } from '../theme';
import { ConnectState, ConnectView } from './connect-view';

interface Scenario {
  label: string;
  state: ConnectState;
  request: ConnectRequest | null;
  message?: string;
  error?: string;
}

const DOMAINS: ConnectDomain[] = [
  {
    id: 'd1',
    name: 'ironoathbeardco.ca',
    mailboxes: [
      { id: 'm1', address: 'contact@ironoathbeardco.ca' },
      { id: 'm2', address: 'orders@ironoathbeardco.ca' },
      { id: 'm3', address: 'brad@ironoathbeardco.ca' },
    ],
  },
  { id: 'd2', name: 'ironoathbarbers.com', mailboxes: [{ id: 'm4', address: 'hello@ironoathbarbers.com' }, { id: 'm5', address: 'bookings@ironoathbarbers.com' }] },
  { id: 'd3', name: 'ironoath.shop', mailboxes: [{ id: 'm6', address: 'support@ironoath.shop' }] },
];

const base = (over: Partial<ConnectRequest> = {}): ConnectRequest => ({
  clientName: 'ChatGPT',
  redirectHost: 'chatgpt.com',
  scopes: ['mail.read', 'mail.draft'],
  allowed: true,
  domains: DOMAINS,
  ...over,
});

const SCENARIOS: Scenario[] = [
  { label: 'Read and draft', state: 'ready', request: base() },
  { label: 'Asks to send', state: 'ready', request: base({ scopes: ['mail.read', 'mail.draft', 'mail.send'] }) },
  { label: 'One mailbox', state: 'ready', request: base({ domains: [{ ...DOMAINS[0], mailboxes: DOMAINS[0].mailboxes.slice(0, 1) }] }) },
  { label: 'Error on approve', state: 'ready', request: base(), error: 'The authorization request expired. Start the connection again from the app.' },
  { label: 'Connected', state: 'redirecting', request: base() },
  { label: 'Not allowed', state: 'denied', request: base({ allowed: false }), message: 'Only owners and admins of an organization can give an app access to a mailbox.' },
  { label: 'No mailbox', state: 'empty', request: base({ domains: [{ ...DOMAINS[0], mailboxes: [] }] }), message: 'Create a mailbox first, then start the connection again from the app.' },
  { label: 'Bad link', state: 'failed', request: null, message: 'The link is incomplete. Start the connection again from the app.' },
  { label: 'Loading', state: 'loading', request: null },
];

/** /connect/preview (dev builds only): every state of the consent page on mock data, no OAuth request needed. `?s=<number>` picks a state, `?theme=light|dark` the theme. */
@Component({
  selector: 'amelu-connect-preview',
  imports: [ConnectView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sticky top-0 z-40 flex flex-wrap items-center gap-1.5 border-b border-line bg-surface px-4 py-2 text-[12px]">
      <span class="mr-1 font-medium text-muted">Preview</span>
      @for (s of scenarios; track s.label; let i = $index) {
        <button
          type="button"
          class="cursor-pointer rounded-md border px-2.5 py-1"
          [class]="i === index() ? 'border-accent/40 bg-accent/10 text-link' : 'border-line hover:bg-bg'"
          (click)="pick(i)"
        >{{ s.label }}</button>
      }
      <span class="ml-auto"></span>
      <button type="button" class="cursor-pointer rounded-md border border-line px-2.5 py-1 hover:bg-bg" (click)="toggleTheme()">
        {{ theme.resolved() === 'dark' ? 'Light' : 'Dark' }} theme
      </button>
    </div>
    <amelu-connect-view
      [state]="current().state"
      [request]="current().request"
      [message]="current().message ?? null"
      [error]="current().error ?? null"
      account="brad@ironoathbeardco.ca"
      [(targets)]="targets"
      [(granted)]="granted"
      (approved)="pick(4)"
      (denied)="pick(0)"
    />
  `,
})
export class ConnectPreview {
  protected readonly theme = inject(Theme);
  protected readonly scenarios = SCENARIOS;
  protected readonly index = signal(0);
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;

  constructor() {
    const start = Number(this.params.get('s') ?? 0);
    if (Number.isInteger(start) && start >= 0 && start < SCENARIOS.length) this.pick(start);
    const theme = this.params.get('theme');
    if (theme === 'light' || theme === 'dark') this.theme.set(theme);
  }
  protected readonly current = computed(() => SCENARIOS[this.index()]);
  protected readonly targets = signal<ConnectTargets>({ all: false, domainIds: [], mailboxIds: [] });
  protected readonly granted = signal<string[]>(['mail.read', 'mail.draft']);

  protected pick(i: number): void {
    this.index.set(i);
    this.targets.set(i === 2 ? { all: false, domainIds: [], mailboxIds: ['m1'] } : i === 0 ? { all: false, domainIds: ['d2'], mailboxIds: ['m1'] } : { all: false, domainIds: [], mailboxIds: [] });
    this.granted.set(SCENARIOS[i].request?.scopes.filter((s) => s !== 'mail.send') ?? []);
  }

  protected toggleTheme(): void {
    this.theme.set(this.theme.resolved() === 'dark' ? 'light' : 'dark');
  }
}
