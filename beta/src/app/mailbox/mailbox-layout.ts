import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { injectDomain } from '../domain-context';
import { Icon } from '../icon';
import { DitherShader } from '../login/dither-shader';
import { Alert } from '../alert/alert';
import { LoadErrors } from '../load-errors';
import { MailboxApi, RepairResult } from './mailbox-api';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { signal } from '@angular/core';
import { UI } from '../ui';
import { apiUrl } from '../config';
import { MAILBOX_STATUS, badgeClass } from '../status';
import { MailboxContext } from './mailbox-context';

/** Header and the shared mailbox for every /domains/:domainId/mailboxes/:mailboxId page. */
@Component({
  selector: 'amelu-mailbox-layout',
  imports: [RouterLink, RouterOutlet, DatePipe, Alert, Icon, DitherShader],
  providers: [MailboxContext],
  template: `
    @if (mailbox() === null) {
      <div class="mx-auto max-w-md py-16 text-center">
        <h1 class="text-[22px] font-bold tracking-[-0.4px]">Mailbox not found</h1>
        <p class="mt-2 text-[13px] text-muted">It may have been deleted, or it belongs to another organization.</p>
        <a [routerLink]="mailboxesLink()" class="mt-4 inline-block text-[13px] font-medium text-link hover:underline">Back to Mailboxes</a>
      </div>
    } @else {
      <!-- The mailbox as a banner, like the domain overview: the same dither, its address large, and
           its status and details below. -->
      <section class="relative mb-6 overflow-hidden rounded-lg bg-hero px-7 pt-5 pb-6 text-hero-ink max-mobile:px-5">
        <div class="pointer-events-none absolute inset-0 opacity-45 [mask-image:linear-gradient(to_left,black_0%,rgba(0,0,0,0.7)_25%,rgba(0,0,0,0.3)_55%,rgba(0,0,0,0.06)_85%,transparent_100%)] max-mobile:opacity-25" aria-hidden="true">
          <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="3" [speed]="0.35" />
        </div>

        <div class="relative flex flex-wrap items-center justify-between gap-3">
          <nav class="flex min-w-0 items-center gap-1 text-[13px] font-medium text-hero-ink/70" aria-label="Breadcrumb">
            @for (crumb of crumbs(); track $index; let last = $last) {
              @if (crumb.link) {
                <a [routerLink]="crumb.link" class="truncate hover:text-ink hover:underline">{{ crumb.label }}</a>
              } @else {
                <span class="truncate">{{ crumb.label }}</span>
              }
              @if (!last) {
                <amelu-icon name="chevronRight" [size]="12" class="flex-none" />
              }
            }
          </nav>
          @if (mailbox()) {
            <!-- A real link: the API answers with a redirect into webmail, signed in as this mailbox. -->
            <a [href]="webmailUrl()" target="_blank" rel="noreferrer" [class]="ui.outline + ' bg-surface/70 backdrop-blur-sm'">
              Open in webmail
            </a>
          }
        </div>

        @if (mailbox(); as m) {
          <h1 class="relative mt-7 truncate text-[34px] leading-[1.1] font-normal tracking-[-0.02em] text-ink max-mobile:mt-5 max-mobile:text-[26px]" [title]="m.address">{{ m.address }}</h1>
          <div class="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-hero-ink/75">
            <span [class]="status()!.class">{{ status()!.label }}</span>
            @if (m.displayName) {
              <span class="text-ink">{{ m.displayName }}</span>
              <span aria-hidden="true">·</span>
            }
            <span>Created {{ m.createdAt | date: 'd MMM y' }}</span>
          </div>
        } @else {
          <span class="relative mt-7 block h-9 w-72 max-w-full animate-pulse rounded bg-hero-ink/10"></span>
          <span class="relative mt-3 block h-5 w-48 animate-pulse rounded bg-hero-ink/10"></span>
        }
      </section>

      @if (repaired(); as r) {
        <amelu-alert class="mb-5" kind="success" title="Mailbox repaired">
          @if (r.mailboxRecreated) {
            <p>{{ r.address }} exists on the mail servers again. Its new password, shown only now:</p>
            <p class="mt-1 font-mono text-[14px] font-bold select-all">{{ r.password }}</p>
          } @else {
            <p>{{ r.address }} already existed on the mail servers; nothing was changed.</p>
          }
          @if (r.domainRecreated) {
            <p class="mt-1">The domain was recreated too, with a new DKIM key: check the DNS records page.</p>
          }
          <p class="mt-2"><button type="button" class="cursor-pointer font-medium underline" (click)="reload()">Reload the page</button></p>
        </amelu-alert>
      } @else if (missingInCluster()) {
        <amelu-alert class="mb-5" kind="warning" title="This mailbox is missing on the mail servers">
          <p>Amelu knows it, but the mail cluster has no account for it, so mail, passwords and settings can't be loaded or changed. Repair recreates it with a new password; mail that was in it is not recovered.</p>
          @if (repairError(); as message) {
            <p class="mt-1 font-semibold">{{ message }}</p>
          }
          <p class="mt-2">
            <button type="button" [class]="ui.primary" (click)="repair()" [disabled]="repairing()">
              {{ repairing() ? 'Repairing…' : 'Repair mailbox' }}
            </button>
          </p>
        </amelu-alert>
      }

      <router-outlet />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxLayout {
  private readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;
  protected readonly webmailUrl = computed(() => apiUrl(`/api/mailboxes/${this.ctx.id()}/webmail`));

  private readonly api = inject(MailboxApi);
  private readonly errors = inject(LoadErrors);
  protected readonly missingInCluster = computed(() => this.errors.code() === 'MAIL_CLUSTER_NOT_FOUND');
  protected readonly repairing = signal(false);
  protected readonly repaired = signal<RepairResult | null>(null);
  protected readonly repairError = signal<string | null>(null);

  protected async repair(): Promise<void> {
    this.repairing.set(true);
    this.repairError.set(null);
    try {
      this.repaired.set(await firstValueFrom(this.api.repair(this.ctx.id())));
      this.errors.set(null);
    } catch (err) {
      this.repairError.set(errorMessage(err, 'Could not repair the mailbox'));
    } finally {
      this.repairing.set(false);
    }
  }

  protected reload(): void {
    location.reload();
  }
  private readonly domainCtx = injectDomain();
  protected readonly mailbox = this.ctx.mailbox;

  protected readonly mailboxesLink = computed(() => `/domains/${this.domainCtx.id()}/mailboxes`);

  protected readonly crumbs = computed((): { label: string; link?: string }[] => [
    { label: 'Domains', link: '/domains' },
    { label: this.domainCtx.domain()?.name ?? '', link: '/domains/' + this.domainCtx.id() },
    { label: 'Mailboxes', link: this.mailboxesLink() },
    { label: this.mailbox()?.address ?? '' },
  ]);

  protected readonly status = computed(() => {
    const mailbox = this.mailbox();
    if (!mailbox) return null;
    const status = MAILBOX_STATUS[mailbox.status];
    return { label: status.label, class: badgeClass(status.tone) };
  });
}
