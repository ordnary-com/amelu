import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert } from '../../alert/alert';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxContext } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';

export const MAIL_SERVER = 'marduk.mx.amelu.org';

interface Setting {
  label: string;
  value: string;
  copy?: boolean;
  muted?: boolean;
}

/** The current dashboard's MailboxUsageInstructionsPage: what to type into a mail app. */
@Component({
  selector: 'amelu-mailbox-usage',
  imports: [RouterLink, Alert, Icon, MailboxHeading],
  template: `
    <amelu-mailbox-heading title="Usage instructions">
      To correctly configure your email client, you will need the correct server parameters. Please find them below.
    </amelu-mailbox-heading>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        @for (section of sections(); track section.title) {
          <section>
            <h2 [class]="ui.sectionTitle">{{ section.title }}</h2>
            <dl [class]="ui.card + ' overflow-hidden'">
              @for (row of section.rows; track row.label) {
                <div class="flex items-center gap-4 border-b border-line px-4 py-2.5 last:border-b-0">
                  <dt class="w-28 flex-none text-[13px] text-muted">{{ row.label }}</dt>
                  <dd class="min-w-0 flex-1 truncate text-[13px]" [class.text-muted]="row.muted" [class.font-mono]="row.copy">
                    @if (row.value) {
                      {{ row.value }}
                    } @else {
                      <span class="block h-3 w-40 animate-pulse rounded bg-bg"></span>
                    }
                  </dd>
                  @if (row.copy && row.value) {
                    <button
                      type="button"
                      class="inline-flex h-7 flex-none cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted hover:bg-bg hover:text-ink"
                      [attr.aria-label]="'Copy ' + row.label.toLowerCase()"
                      (click)="copy(row.value)"
                    >
                      <amelu-icon [name]="copied() === row.value ? 'check' : 'copy'" [size]="13" />
                      {{ copied() === row.value ? 'Copied' : 'Copy' }}
                    </button>
                  }
                </div>
              }
            </dl>
          </section>
        }

        <amelu-alert kind="warning" title="Note">
          POP3 and SMTP over StartTLS (port 587) aren't available on this cluster yet: only the ports listed above are
          open. Use IMAP and implicit TLS submission (port 465) for now.
        </amelu-alert>
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Signing in</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            The username is always the full address. The password is the mailbox password, not your Amelu account
            password.
          </p>
          <a [routerLink]="ctx.base() + '/password'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Set or reset the password
          </a>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Can't connect?</h2>
          <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              Check that IMAP or ManageSieve is switched on for this mailbox.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              A suspended mailbox can't sign in until it's activated again.
            </li>
          </ul>
          <a [routerLink]="ctx.base() + '/services'" class="mt-2.5 inline-block text-[13px] font-medium text-link hover:underline">
            Enabled services
          </a>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxUsage {
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;
  protected readonly copied = signal<string | null>(null);

  protected readonly sections = computed(() => {
    const address = this.ctx.mailbox()?.address ?? '';
    const login: Setting[] = [
      { label: 'Username', value: address, copy: true },
      { label: 'Password', value: '(mailbox password)', muted: true },
    ];
    const server = (protocol: string, port: string, security: string): Setting[] => [
      { label: 'Protocol', value: protocol },
      { label: 'Server', value: MAIL_SERVER, copy: true },
      { label: 'Port', value: port },
      { label: 'Security', value: security },
    ];
    return [
      { title: 'Incoming mail', rows: [...server('IMAP', '993', 'TLS'), ...login] },
      { title: 'Outgoing mail', rows: [...server('SMTP', '465', 'TLS'), ...login] },
      { title: 'ManageSieve', rows: server('ManageSieve', '4190', 'StartTLS') },
    ];
  });

  protected async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.copied.set(value);
  }
}
