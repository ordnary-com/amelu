import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert } from '../../alert/alert';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { MailboxContext } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { AUTOCONFIG_ORIGIN, AUTODISCOVER_HOST } from '../../config';

export const MAIL_SERVER = 'marduk.mx.amelu.org';

type Platform = 'apple' | 'windows' | 'android' | 'linux';

const PLATFORM_LABELS: Record<Platform, string> = {
  apple: 'Mac, iPhone and iPad',
  windows: 'Windows',
  android: 'Android',
  linux: 'Linux',
};

/** Mail, calendar and contacts apps that work with Amelu, in the order they're shown on a matching platform. */
interface SetupApp {
  id: string;
  name: string;
  platforms: Platform[];
  covers: ('Mail' | 'Calendar' | 'Contacts')[];
  how: string;
}

const APPS: SetupApp[] = [
  {
    id: 'apple',
    name: 'Apple Mail, Calendar and Contacts',
    platforms: ['apple'],
    covers: ['Mail', 'Calendar', 'Contacts'],
    how: 'Download the profile on the device, then install it in Settings. It sets up all three and asks for the mailbox password once.',
  },
  {
    id: 'fantastical',
    name: 'Fantastical',
    platforms: ['apple'],
    covers: ['Calendar'],
    how: `Add a CalDAV account with server ${MAIL_SERVER}, the full address as username and the mailbox password.`,
  },
  {
    id: 'busycal',
    name: 'BusyCal',
    platforms: ['apple'],
    covers: ['Calendar'],
    how: `Add a CalDAV account with server ${MAIL_SERVER}, the full address as username and the mailbox password.`,
  },
  {
    id: 'emclient',
    name: 'eM Client',
    platforms: ['windows', 'apple'],
    covers: ['Mail', 'Calendar', 'Contacts'],
    how: 'Add the account with the full address. If it asks, choose manual setup and use the mail, calendar and contacts settings below.',
  },
  {
    id: 'thunderbird',
    name: 'Thunderbird',
    platforms: ['windows', 'apple', 'linux'],
    covers: ['Mail', 'Calendar', 'Contacts'],
    how: 'Add the account with the mail settings below, then a network calendar and a CardDAV address book with the calendar and contacts addresses.',
  },
  {
    id: 'davx5',
    name: 'DAVx⁵',
    platforms: ['android'],
    covers: ['Calendar', 'Contacts'],
    how: `Add an account with "Login with URL and user name": https://${MAIL_SERVER}, the full address and the mailbox password. Calendar and contacts then show up in the phone's own apps.`,
  },
  {
    id: 'android-mail',
    name: 'Gmail app or any Android mail app',
    platforms: ['android'],
    covers: ['Mail'],
    how: 'Add another account, choose Other (IMAP) and use the mail settings below.',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    platforms: ['windows', 'apple', 'android'],
    covers: ['Mail'],
    how: 'Finds the mail settings by itself once the domain has this DNS record (add it once per domain). Outlook has no calendar or contacts sync of its own.',
  },
  {
    id: 'evolution',
    name: 'Evolution',
    platforms: ['linux'],
    covers: ['Mail', 'Calendar', 'Contacts'],
    how: 'Add the account with the mail settings below, then a CalDAV calendar and a CardDAV address book with the calendar and contacts addresses.',
  },
];

/** Best guess from the browser; iPadOS reports itself as a Mac, which is the right answer here too. */
function detectPlatform(): Platform | null {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua)) return 'apple';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux';
  return null;
}

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

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        <section>
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 class="text-[14px] font-bold">Set up your apps</h2>
            @if (platformLabel(); as label) {
              <span class="text-[12px] text-muted">Showing apps for {{ label }}</span>
            }
          </div>
          <div [class]="ui.card + ' overflow-hidden'">
            @for (app of shownApps(); track app.id) {
              <div class="border-b border-line px-4 py-3.5 last:border-b-0">
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold">
                      {{ app.name }}
                      @for (part of app.covers; track part) {
                        <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-normal text-muted">{{ part }}</span>
                      }
                    </p>
                    <p class="mt-0.5 text-[13px] text-muted">{{ app.how }}</p>
                  </div>
                  @if (app.id === 'apple' && profileUrl(); as url) {
                    <a [href]="url" [class]="ui.outline" download>
                      <amelu-icon name="download" [size]="15" />
                      Download profile
                    </a>
                  }
                </div>
                @if (app.id === 'outlook' && autodiscover(); as record) {
                  <div class="mt-2.5 flex items-center gap-2 rounded-md bg-bg px-3 py-2">
                    <code class="min-w-0 flex-1 truncate text-[12px]">{{ record }}</code>
                    <button
                      type="button"
                      class="inline-flex h-7 flex-none cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted hover:bg-surface hover:text-ink"
                      aria-label="Copy the DNS record"
                      (click)="copy(record)"
                    >
                      <amelu-icon [name]="copied() === record ? 'check' : 'copy'" [size]="13" />
                      {{ copied() === record ? 'Copied' : 'Copy' }}
                    </button>
                  </div>
                }
              </div>
            }
            @if (hiddenApps() > 0) {
              <button
                type="button"
                class="w-full cursor-pointer px-4 py-3 text-left text-[13px] font-medium text-link hover:bg-bg/60"
                (click)="showAll.set(true)"
              >
                Show all apps ({{ hiddenApps() }} more)
              </button>
            }
          </div>
          <p class="mt-2 text-[12px] text-muted">Any other app: use the settings below.</p>
        </section>

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

  /** The visitor's platform, to put the apps that work on it first. */
  protected readonly platform = detectPlatform();
  protected readonly platformLabel = computed(() => (this.platform ? PLATFORM_LABELS[this.platform] : null));
  protected readonly showAll = signal(false);
  private readonly appsForPlatform = APPS.filter((app) => !this.platform || app.platforms.includes(this.platform));
  protected readonly shownApps = computed(() => (this.showAll() ? [...this.appsForPlatform, ...APPS.filter((a) => !this.appsForPlatform.includes(a))] : this.appsForPlatform));
  protected readonly hiddenApps = computed(() => (this.showAll() ? 0 : APPS.length - this.appsForPlatform.length));

  /** An Apple configuration profile for this address, made by the autoconfig Worker. */
  protected readonly profileUrl = computed(() => {
    const mailbox = this.ctx.mailbox();
    if (!mailbox) return null;
    const params = new URLSearchParams({ email: mailbox.address, name: mailbox.displayName ?? '' });
    return `${AUTOCONFIG_ORIGIN}/profile.mobileconfig?${params}`;
  });

  /** The SRV record that points Outlook at the autodiscover Worker. */
  protected readonly autodiscover = computed(() => {
    const address = this.ctx.mailbox()?.address;
    if (!address) return null;
    return `_autodiscover._tcp.${address.split('@')[1]}. SRV 0 0 443 ${AUTODISCOVER_HOST}.`;
  });

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
      {
        title: 'Calendar and contacts',
        rows: [
          { label: 'Calendar', value: `https://${MAIL_SERVER}/dav/cal/`, copy: true },
          { label: 'Contacts', value: `https://${MAIL_SERVER}/dav/card/`, copy: true },
          ...login,
        ],
      },
      { title: 'ManageSieve', rows: server('ManageSieve', '4190', 'StartTLS') },
    ];
  });

  protected async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.copied.set(value);
  }
}
