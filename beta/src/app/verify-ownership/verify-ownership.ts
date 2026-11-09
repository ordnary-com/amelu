import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, Domain, errorMessage } from '../api';
import { Domains } from '../domains';
import { Icon } from '../icon';
import { UI } from '../ui';
import { DitherShader } from '../login/dither-shader';

// How often the open card looks for the record by itself.
const RECHECK_MS = 20_000;

/**
 * The one step before a domain exists on the mail server: a TXT record that
 * proves the customer owns it. Shown on Add domain and on an unverified
 * domain's page; checks by itself every 20 seconds while it's open.
 */
@Component({
  selector: 'amelu-verify-ownership',
  imports: [Icon, DitherShader],
  template: `
    @let record = domain().verification;
    <section class="relative overflow-hidden rounded-lg border border-line bg-surface *:relative">
      <div
        class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom_left,black,rgba(0,0,0,0.4)_35%,transparent_70%)]"
        aria-hidden="true"
      >
        <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
      </div>

      <div class="p-5">
        <amelu-icon name="shield" [size]="20" class="block text-ink" />
        <h2 class="mt-3 text-[16px] font-bold">Verify that you own {{ domain().name }}</h2>
        <p class="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
          Add this TXT record where the domain's DNS is managed, usually your registrar. Nothing changes for your mail
          until it's verified, and you can remove the record afterwards.
        </p>
      </div>

      @if (record) {
        <dl class="divide-y divide-line border-t border-line text-[13px]">
          @for (row of [{ label: 'Type', value: record.type, copy: false }, { label: 'Name', value: record.name, copy: true }, { label: 'Value', value: record.value, copy: true }]; track row.label) {
            <div class="flex min-h-12 items-center gap-4 px-5 py-2.5">
              <dt class="w-16 flex-none text-muted">{{ row.label }}</dt>
              <dd class="min-w-0 flex-1 truncate font-mono text-[13px]" [title]="row.value">{{ row.value }}</dd>
              @if (row.copy) {
                <button type="button" [class]="ui.outline + ' h-7 flex-none px-2.5 text-[12px]'" (click)="copy(row.value)">
                  {{ copied() === row.value ? 'Copied' : 'Copy' }}
                </button>
              }
            </div>
          }
        </dl>
        <p class="border-t border-line px-5 py-2.5 text-[12px] text-muted">
          Some providers add the domain to the name themselves. If yours does, enter just <span class="font-mono text-ink">_amelu</span>.
        </p>
      }

      <div class="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <button type="button" [class]="ui.primary" [disabled]="checking()" (click)="check()">
          {{ checking() ? 'Checking...' : 'Check now' }}
        </button>
        <span class="flex items-center gap-2 text-[12px]" [class]="error() ? 'text-bad' : 'text-muted'" role="status">
          @if (error(); as message) {
            {{ message }}
          } @else {
            <span class="size-1.5 animate-pulse rounded-full bg-warn" aria-hidden="true"></span>
            We also check by ourselves every 20 seconds while this page is open.
          }
        </span>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class VerifyOwnership {
  readonly domain = input.required<Domain>();
  /** The domain as it is once verified (status dns_pending). */
  readonly verified = output<Domain>();

  private readonly api = inject(Api);
  private readonly domains = inject(Domains);
  protected readonly ui = UI;
  protected readonly checking = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal<string | null>(null);

  constructor() {
    const timer = setInterval(() => void this.check(true), RECHECK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** A background check stays quiet when the record isn't there yet. */
  protected async check(quiet = false): Promise<void> {
    if (this.checking()) return;
    this.checking.set(true);
    if (!quiet) this.error.set(null);
    try {
      const domain = await firstValueFrom(this.api.verifyDomainOwnership(this.domain().id));
      this.error.set(null);
      this.domains.reload();
      this.verified.emit(domain);
    } catch (err) {
      if (!quiet) this.error.set(errorMessage(err, "The record couldn't be checked. Try again in a moment."));
    } finally {
      this.checking.set(false);
    }
  }

  protected async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.copied.set(value);
    setTimeout(() => this.copied.set(null), 1500);
  }
}
