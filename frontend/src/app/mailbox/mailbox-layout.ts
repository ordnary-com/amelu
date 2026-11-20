import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { injectDomain } from '../domain-context';
import { Alert } from '../alert/alert';
import { LoadErrors } from '../load-errors';
import { MailboxApi, RepairResult } from './mailbox-api';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../api';
import { signal } from '@angular/core';
import { UI } from '../ui';
import { apiUrl } from '../config';
import { MAILBOX_STATUS, TONES } from '../status';
import { MailboxContext } from './mailbox-context';
import { CrumbTitle } from '../page-header/page-header';
import { Icon } from '../icon';

/** Header and the shared mailbox for every /domains/:domainId/mailboxes/:mailboxId page. */
@Component({
  selector: 'amelu-mailbox-layout',
  imports: [RouterLink, RouterOutlet, DatePipe, Alert, CrumbTitle, Icon],
  providers: [MailboxContext],
  template: `
    @if (mailbox() === null) {
      <div class="mx-auto max-w-md py-16 text-center">
        <h1 class="text-[22px] leading-tight font-normal">Mailbox not found</h1>
        <p class="mt-2 text-[13px] text-muted">It may have been deleted, or it belongs to another organization.</p>
        <a [routerLink]="mailboxesLink()" class="mt-4 inline-block text-[13px] font-medium text-link hover:underline">Back to Mailboxes</a>
      </div>
    } @else {
      <!-- The mailbox's header, like the domain overview's: the title with its breadcrumb, its status and
           details below, and the main action on the right. -->
      <div class="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div class="min-w-0">
          <amelu-crumb-title [title]="mailbox()?.address ?? ''" [crumbs]="crumbs()" />
          @if (mailbox(); as m) {
            <p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px] text-muted">
              <span class="inline-flex h-6 flex-none items-center gap-1.5 rounded px-2 text-[12px] font-medium" [class]="status()!.tone">
                <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
                {{ status()!.label }}
              </span>
              @if (m.displayName) {
                <span aria-hidden="true">·</span>
                <span class="text-ink">{{ m.displayName }}</span>
              }
              <span aria-hidden="true">·</span>
              <span>Created {{ m.createdAt | date: 'd MMM y' }}</span>
            </p>
          } @else {
            <span class="mt-2 block h-5 w-64 animate-pulse rounded bg-bg"></span>
          }
        </div>
        @if (mailbox()) {
          <div class="flex gap-2">
            <!-- A real link: the API answers with a redirect into webmail, signed in as this mailbox. -->
            <a [href]="webmailUrl()" target="_blank" rel="noreferrer" [class]="ui.outline + ' h-9'">
              Open in webmail
              <amelu-icon name="external" [size]="14" class="text-muted" />
            </a>
          </div>
        }
      </div>

      @if (repaired(); as r) {
        <amelu-alert class="mb-5" kind="success" title="Mailbox repaired">
          @if (r.mailboxRecreated) {
            <p>{{ r.address }} exists on the mail servers again. Its new password, shown only now:</p>
            <p class="mt-1 font-mono text-[14px] font-medium select-all">{{ r.password }}</p>
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
    return { label: status.label, tone: TONES[status.tone] };
  });
}
