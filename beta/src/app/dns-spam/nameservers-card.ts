import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, catchError, of } from 'rxjs';
import { errorMessage } from '../api';
import { Icon } from '../icon';
import { badgeClass } from '../status';
import { UI } from '../ui';
import { DnsSpamApi, DomainNameservers } from './dns-spam-api';

/**
 * Where the domain's DNS lives. On Amelu nameservers it shows the names to
 * set at the registrar until they're in use; otherwise it offers the switch.
 */
@Component({
  selector: 'amelu-nameservers-card',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Hidden when there's nothing to show, so an empty card doesn't add a gap to the column it sits in.
  host: { class: 'block empty:hidden' },
  template: `
    @if (state(); as ns) {
      @if (ns.mode === 'amelu') {
        <section [class]="ui.card + ' p-4'">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-[14px] font-bold">Amelu nameservers</h2>
            @if (ns.status === 'active') {
              <span [class]="badge.ok">In use</span>
            } @else {
              <span [class]="badge.warn">Waiting</span>
            }
          </div>
          @if (ns.status === 'active') {
            <p class="mt-1 text-[13px] leading-relaxed text-muted">
              Amelu hosts the DNS for {{ domain() }}, and every mail record is set for you.
            </p>
          } @else {
            <p class="mt-1 text-[13px] leading-relaxed text-muted">
              At the company where you registered {{ domain() }}, replace its nameservers with these two. It usually
              takes a few minutes, sometimes up to a day.
            </p>
          }
          <ul class="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line">
            @for (name of ns.nameservers ?? []; track name) {
              <li class="flex items-center gap-2 py-1.5 pr-1.5 pl-2.5">
                <code class="min-w-0 flex-1 truncate font-mono text-[13px]">{{ name }}</code>
                <button
                  type="button"
                  class="inline-flex size-7 flex-none cursor-pointer items-center justify-center rounded-md hover:bg-bg"
                  [class]="copied() === name ? 'text-ok' : 'text-muted hover:text-ink'"
                  [attr.aria-label]="'Copy ' + name"
                  (click)="copy(name)"
                >
                  <amelu-icon [name]="copied() === name ? 'check' : 'copy'" [size]="14" />
                </button>
              </li>
            }
          </ul>
          <div class="mt-3 flex flex-wrap gap-2">
            @if (ns.status !== 'active') {
              <button type="button" [class]="ui.outline" [disabled]="loading()" (click)="load()">
                {{ loading() ? 'Checking...' : 'Check again' }}
              </button>
            }
            @if (showEditorLink()) {
              <a [routerLink]="'/domains/' + domainId() + '/dns/zone'" [class]="ui.outline">Manage DNS records</a>
            }
          </div>
        </section>
      } @else if (ns.available) {
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Let Amelu host your DNS</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Point {{ domain() }} at the Amelu nameservers and every mail record is set and kept right for you. We copy
            the records your domain has now, so your website keeps working.
          </p>
          @if (confirming()) {
            <p class="mt-3 rounded-md border border-warn/40 bg-warn/10 p-2.5 text-[12px] leading-relaxed">
              Check the copied records before you change the nameservers at your registrar. Records we couldn't find
              (rare subdomains, for example) you add yourself.
            </p>
            <div class="mt-3 flex gap-2">
              <button type="button" [class]="ui.primary" [disabled]="switching()" (click)="switch()">
                {{ switching() ? 'Setting up...' : 'Use Amelu nameservers' }}
              </button>
              <button type="button" [class]="ui.outline" (click)="confirming.set(false)">Cancel</button>
            </div>
          } @else {
            <button type="button" [class]="ui.outline + ' mt-3'" (click)="confirming.set(true)">Use Amelu nameservers</button>
          }
          @if (error(); as message) {
            <p class="mt-2 text-[12px] text-bad">{{ message }}</p>
          }
        </section>
      }
    }
  `,
})
export class NameserversCard {
  private readonly api = inject(DnsSpamApi);
  protected readonly ui = UI;
  protected readonly badge = { ok: badgeClass('ok'), warn: badgeClass('warn') };

  readonly domainId = input.required<string>();
  readonly domain = input('');
  readonly showEditorLink = input(true);
  /** After the domain moved onto Amelu nameservers. */
  readonly changed = output<void>();

  protected readonly state = signal<DomainNameservers | null>(null);
  protected readonly loading = signal(false);
  protected readonly switching = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal<string | null>(null);

  private sub?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      this.domainId();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.sub = this.api
      .domainNameservers(this.domainId())
      .pipe(catchError(() => of(null)))
      .subscribe((state) => {
        this.state.set(state);
        this.loading.set(false);
      });
  }

  protected switch(): void {
    this.switching.set(true);
    this.error.set(null);
    this.api.useAmeluNameservers(this.domainId()).subscribe({
      next: (state) => {
        this.state.set(state);
        this.switching.set(false);
        this.confirming.set(false);
        this.changed.emit();
      },
      error: (err) => {
        this.error.set(errorMessage(err, 'Amelu nameservers could not be set up.'));
        this.switching.set(false);
      },
    });
  }

  protected async copy(name: string): Promise<void> {
    await navigator.clipboard.writeText(name);
    this.copied.set(name);
    setTimeout(() => this.copied.set(null), 1500);
  }
}
