import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { injectDomain } from '../domain-context';
import { PageHeader } from '../page-header/page-header';
import { MAILBOX_STATUS, badgeClass } from '../status';
import { MailboxContext } from './mailbox-context';

/** Header and the shared mailbox for every /domains/:domainId/mailboxes/:mailboxId page. */
@Component({
  selector: 'amelu-mailbox-layout',
  imports: [RouterLink, RouterOutlet, PageHeader, DatePipe],
  providers: [MailboxContext],
  template: `
    @if (mailbox() === null) {
      <div class="mx-auto max-w-md py-16 text-center">
        <h1 class="text-[22px] font-bold tracking-[-0.4px]">Mailbox not found</h1>
        <p class="mt-2 text-[13px] text-muted">It may have been deleted, or it belongs to another organization.</p>
        <a [routerLink]="mailboxesLink()" class="mt-4 inline-block text-[13px] font-medium text-link hover:underline">Back to Mailboxes</a>
      </div>
    } @else {
      <amelu-page-header [title]="mailbox()?.address ?? '\u00a0'" [crumbs]="crumbs()">
        @if (mailbox(); as m) {
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span [class]="status()!.class">{{ status()!.label }}</span>
            @if (m.displayName) {
              <span class="text-ink">{{ m.displayName }}</span>
              <span>·</span>
            }
            <span>Created {{ m.createdAt | date: 'd MMM y' }}</span>
          </span>
        } @else {
          <span class="block h-3 w-48 animate-pulse rounded bg-bg"></span>
        }
      </amelu-page-header>

      <router-outlet />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxLayout {
  private readonly ctx = inject(MailboxContext);
  private readonly domainCtx = injectDomain();
  protected readonly mailbox = this.ctx.mailbox;

  protected readonly mailboxesLink = computed(() => `/domains/${this.domainCtx.id()}/mailboxes`);

  protected readonly crumbs = computed(() => [
    { label: 'Email Domains', link: '/domains' },
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
