import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { ConnectDomain, ConnectRequest, ConnectTargets } from '../api';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { SwitchRow } from '../mailbox/shared/switch-row';
import { UI } from '../ui';

export type ConnectState = 'loading' | 'ready' | 'denied' | 'empty' | 'failed' | 'redirecting';

const SCOPES: Record<string, { title: string; hint: string; risky?: boolean }> = {
  'mail.read': { title: 'Read mail', hint: 'See messages in the inbox and sent folders.' },
  'mail.draft': { title: 'Write drafts', hint: 'Save drafts in the Drafts folder. Nothing is sent.' },
  'mail.send': { title: 'Send mail', hint: 'Send email as this mailbox without asking you first. This cannot be undone.', risky: true },
};

/** What the consent page looks like, with no data loading in it, so the preview can render every state. */
@Component({
  selector: 'amelu-connect-view',
  imports: [Alert, Icon, SwitchRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh flex-col items-center bg-bg px-4 py-8 text-ink sm:py-12' },
  template: `
    <div class="flex w-full max-w-[520px] flex-1 flex-col">
      <img src="/amelu-logo.png" alt="Amelu" class="h-[22px] w-auto self-start" />

      <div class="my-auto w-full py-10">
        @switch (state()) {
          @case ('loading') {
            <div class="space-y-5" aria-busy="true" aria-label="Loading">
              <span class="block h-12 w-40 animate-pulse rounded-lg bg-surface"></span>
              <span class="block h-24 animate-pulse rounded border border-line bg-surface"></span>
              <span class="block h-48 animate-pulse rounded border border-line bg-surface"></span>
            </div>
          }

          @case ('ready') {
            <div class="flex items-center gap-3" aria-hidden="true">
              <span class="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-[18px] font-bold text-link">{{ initial() }}</span>
              <span class="flex items-center gap-1 text-muted">
                <span class="size-1 rounded-full bg-current"></span><span class="size-1 rounded-full bg-current"></span>
                <amelu-icon name="arrowRight" [size]="16" />
              </span>
              <span class="flex size-12 items-center justify-center rounded-xl border border-line bg-surface">
                <img src="/amelu-icon.png" alt="" class="size-6" />
              </span>
            </div>
            <h1 class="mt-5 text-[22px] font-semibold tracking-[-0.2px]">Connect {{ request()?.clientName }} to your mail</h1>
            <p class="mt-1.5 text-[14px] leading-relaxed text-muted">
              {{ request()?.clientName }} ({{ request()?.redirectHost }}) is asking for access to your mail. Choose what it can reach and what it may do.
            </p>

            <form class="mt-7 space-y-5" (submit)="submit($event)">
              <section [class]="ui.setCard">
                <div [class]="ui.setHeader">
                  <h2 [class]="ui.setTitle">Access</h2>
                  <span class="text-[13px] text-muted">{{ reach() }}</span>
                </div>
                <div class="divide-y divide-line">
                  @if (domains().length > 1 || domains()[0]?.mailboxes?.length !== 1) {
                    <amelu-switch-row label="Everything in your organization" [checked]="targets().all" (checkedChange)="toggleAll($event)" [disabled]="busy()">
                      All domains and mailboxes, including ones you add later.
                    </amelu-switch-row>
                  }
                  <div class="max-h-[420px] divide-y divide-line overflow-y-auto">
                    @for (domain of domains(); track domain.id) {
                      <div>
                        <amelu-switch-row [label]="domain.name" [checked]="domainOn(domain)" (checkedChange)="toggleDomain(domain.id, $event)" [disabled]="busy() || targets().all">
                          Every mailbox on this domain, including ones you add later.
                        </amelu-switch-row>
                        @for (box of domain.mailboxes; track box.id) {
                          <div class="border-t border-line bg-well pl-5">
                            <amelu-switch-row [label]="box.address" [checked]="mailboxOn(domain, box.id)" (checkedChange)="toggleMailbox(box.id, $event)" [disabled]="busy() || targets().all || domainOn(domain)" />
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
                <p [class]="ui.setNote">
                  <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
                  <span>Anything you don't switch on stays out of reach.</span>
                </p>
              </section>

              <section [class]="ui.setCard">
                <div [class]="ui.setHeader"><h2 [class]="ui.setTitle">Permissions</h2></div>
                <div class="divide-y divide-line">
                  @for (scope of request()?.scopes; track scope) {
                    <amelu-switch-row [label]="info(scope).title" [checked]="granted().includes(scope)" (checkedChange)="toggle(scope, $event)" [disabled]="busy()">
                      <span [class]="info(scope).risky ? 'text-warn' : ''">{{ info(scope).hint }}</span>
                    </amelu-switch-row>
                  }
                </div>
              </section>

              @if (error(); as message) {
                <amelu-alert kind="error" title="Could not connect">{{ message }}</amelu-alert>
              }

              <div class="flex items-center justify-between gap-3">
                <p class="min-w-0 text-[12px] leading-relaxed text-muted">
                  You can disconnect it any time under My Account, Connected Apps.
                </p>
                <div class="flex flex-none gap-2">
                  <button type="button" [class]="ui.outline" [disabled]="busy()" (click)="denied.emit()">Cancel</button>
                  <button type="submit" [class]="ui.primary" [disabled]="busy() || granted().length === 0 || !hasTargets()">
                    {{ busy() ? 'Connecting...' : 'Allow access' }}
                  </button>
                </div>
              </div>
            </form>
          }

          @case ('redirecting') {
            <div class="text-center">
              <span class="mx-auto flex size-12 items-center justify-center rounded-full bg-ok/15 text-ok"><amelu-icon name="check" [size]="22" [strokeWidth]="2.25" /></span>
              <h1 class="mt-5 text-[20px] font-semibold">Connected</h1>
              <p class="mt-1.5 text-[14px] text-muted">Taking you back to {{ request()?.clientName ?? 'the app' }}...</p>
            </div>
          }

          @default {
            <section [class]="ui.setCard">
              <div class="px-6 py-10 text-center">
                <span class="mx-auto flex size-11 items-center justify-center rounded-full bg-bad/15 text-bad"><amelu-icon name="circleAlert" [size]="20" /></span>
                <h1 class="mt-4 text-[17px] font-semibold">{{ heading() }}</h1>
                <p class="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted">{{ message() }}</p>
              </div>
            </section>
          }
        }
      </div>

      <p class="flex items-center justify-center gap-2 text-[12px] text-muted">
        <img src="/ordnary-mark-blue.png" alt="" class="size-4" />
        @if (account(); as who) { Signed in as {{ who }} } @else { Amelu by Ordnary }
      </p>
    </div>
  `,
})
export class ConnectView {
  readonly state = input.required<ConnectState>();
  readonly request = input<ConnectRequest | null>(null);
  readonly message = input<string | null>(null);
  readonly account = input<string | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly targets = model<ConnectTargets>({ all: false, domainIds: [], mailboxIds: [] });
  readonly granted = model<string[]>([]);
  readonly approved = output<void>();
  readonly denied = output<void>();

  protected readonly ui = UI;
  protected readonly initial = computed(() => (this.request()?.clientName ?? '?').trim().charAt(0).toUpperCase());
  protected readonly domains = computed<ConnectDomain[]>(() => this.request()?.domains ?? []);

  protected readonly hasTargets = computed(() => {
    const t = this.targets();
    return t.all || t.domainIds.length > 0 || t.mailboxIds.length > 0;
  });

  /** A summary of what is switched on, for the card header. */
  protected readonly reach = computed(() => {
    const t = this.targets();
    if (t.all) return 'Everything';
    const picked = new Set(t.mailboxIds);
    let count = 0;
    for (const d of this.domains()) {
      if (t.domainIds.includes(d.id)) count += d.mailboxes.length;
      else count += d.mailboxes.filter((m) => picked.has(m.id)).length;
    }
    const domains = t.domainIds.length;
    if (count === 0 && domains === 0) return 'Nothing yet';
    const boxes = count === 1 ? '1 mailbox' : `${count} mailboxes`;
    return domains > 0 ? `${boxes}, ${domains === 1 ? '1 whole domain' : `${domains} whole domains`}` : boxes;
  });

  protected readonly heading = computed(() => {
    switch (this.state()) {
      case 'denied':
        return "You can't connect a mailbox";
      case 'empty':
        return 'No mailbox to connect';
      default:
        return "This connection can't be set up";
    }
  });

  protected info(scope: string): { title: string; hint: string; risky?: boolean } {
    return SCOPES[scope] ?? { title: scope, hint: '' };
  }

  protected toggle(scope: string, on: boolean): void {
    this.granted.update((list) => (on ? [...list.filter((s) => s !== scope), scope] : list.filter((s) => s !== scope)));
  }

  protected domainOn(domain: ConnectDomain): boolean {
    return this.targets().all || this.targets().domainIds.includes(domain.id);
  }

  protected mailboxOn(domain: ConnectDomain, id: string): boolean {
    return this.domainOn(domain) || this.targets().mailboxIds.includes(id);
  }

  protected toggleAll(on: boolean): void {
    this.targets.update((t) => ({ ...t, all: on }));
  }

  protected toggleDomain(id: string, on: boolean): void {
    this.targets.update((t) => ({ ...t, domainIds: on ? [...t.domainIds, id] : t.domainIds.filter((d) => d !== id) }));
  }

  protected toggleMailbox(id: string, on: boolean): void {
    this.targets.update((t) => ({ ...t, mailboxIds: on ? [...t.mailboxIds, id] : t.mailboxIds.filter((m) => m !== id) }));
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.approved.emit();
  }
}
