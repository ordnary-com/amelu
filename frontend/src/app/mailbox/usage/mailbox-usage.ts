import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UI } from '../../ui';
import { MailboxContext } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { Icon } from '../../icon';
import { AUTOCONFIG_ORIGIN, AUTODISCOVER_HOST } from '../../config';
import { PhoneQr } from '../../phone-qr';
import { markSetupStep } from '../../setup-progress';

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
  imports: [RouterLink, MailboxHeading, PhoneQr, Icon],
  template: `
    <amelu-mailbox-heading title="Usage instructions">
      The settings to enter in a mail, calendar or contacts app to use this mailbox.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div class="min-w-0 space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Set up your apps</h2>
            @if (platformLabel(); as label) {
              <span class="truncate text-[13px] text-muted">Showing apps for {{ label }}</span>
            }
          </div>
          <div [class]="ui.well">
            <ul class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              @for (app of shownApps(); track app.id) {
                <li class="px-4 py-3">
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                    <div class="min-w-0 flex-1">
                      <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-medium">
                        {{ app.name }}
                        @for (part of app.covers; track part) {
                          <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] font-medium text-muted">{{ part }}</span>
                        }
                      </p>
                      <p class="mt-0.5 text-[13px] leading-relaxed text-muted">{{ app.how }}</p>
                    </div>
                    @if (app.id === 'apple' && profileUrl(); as url) {
                      <a [href]="url" [class]="ui.outline" download>
                        <amelu-icon name="download" [size]="14" />
                        Download profile
                      </a>
                    }
                  </div>
                  @if (app.id === 'outlook' && autodiscover(); as record) {
                    <div class="mt-2.5 flex items-center gap-1 rounded-md border border-line bg-well py-1 pr-1 pl-3">
                      <code class="min-w-0 flex-1 truncate font-mono text-[12px]" [title]="record">{{ record }}</code>
                      <button
                        type="button"
                        [class]="copyButton + (copied() === record ? ' text-ok' : ' text-muted hover:text-ink')"
                        aria-label="Copy the DNS record"
                        [title]="copied() === record ? 'Copied' : 'Copy'"
                        (click)="copy(record)"
                      >
                        <amelu-icon [name]="copied() === record ? 'check' : 'copy'" [size]="12" />
                      </button>
                    </div>
                  }
                </li>
              }
              @if (hiddenApps() > 0) {
                <li>
                  <button
                    type="button"
                    class="w-full cursor-pointer px-4 py-2.5 text-left text-[13px] text-link hover:bg-bg/40 hover:underline"
                    (click)="showAll.set(true)"
                  >
                    Show all apps ({{ hiddenApps() }} more)
                  </button>
                </li>
              }
            </ul>
            <p class="mt-3 text-[12px] text-muted">Any other app: use the server settings below.</p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Server settings</h2>
          </div>
          <div [class]="ui.well">
            <!-- The sign-in is the same for every server below. -->
            <dl class="mb-3 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              @for (row of login(); track row.label) {
                <div class="flex min-h-11 items-center gap-4 px-4 py-2">
                  <dt class="w-28 flex-none text-[13px] text-muted">{{ row.label }}</dt>
                  <dd class="flex min-w-0 flex-1 items-center gap-1">
                    @if (row.value) {
                      <span class="min-w-0 truncate" [class]="row.copy ? 'font-mono text-[12px]' : 'text-[13px]'" [class.text-muted]="row.muted" [title]="row.copy ? row.value : ''">{{ row.value }}</span>
                      @if (row.copy) {
                        <button
                          type="button"
                          [class]="copyButton + (copied() === row.value ? ' text-ok' : ' text-muted hover:text-ink')"
                          [attr.aria-label]="'Copy ' + row.label.toLowerCase()"
                          [title]="copied() === row.value ? 'Copied' : 'Copy'"
                          (click)="copy(row.value)"
                        >
                          <amelu-icon [name]="copied() === row.value ? 'check' : 'copy'" [size]="12" />
                        </button>
                      }
                    } @else {
                      <span class="block h-3 w-40 animate-pulse rounded bg-bg"></span>
                    }
                  </dd>
                </div>
              }
            </dl>

            <div [class]="ui.tableWrap">
              <table [class]="ui.table">
                <thead>
                  <tr>
                    <th [class]="ui.th">Use</th>
                    <th [class]="ui.th">Server</th>
                    <th [class]="ui.th">Port</th>
                    <th [class]="ui.th + ' max-sm:hidden'">Security</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of servers; track row.use) {
                    <tr [class]="ui.tr">
                      <td [class]="ui.td">
                        <span class="block">{{ row.use }}</span>
                        <span [class]="ui.tdSub">{{ row.protocol }}<span class="sm:hidden">, {{ row.security }}</span></span>
                      </td>
                      <td [class]="ui.td + ' max-w-[260px]'">
                        <span class="flex min-w-0 items-center gap-1">
                          <code class="min-w-0 truncate font-mono text-[12px]" [title]="server">{{ server }}</code>
                          <button
                            type="button"
                            [class]="copyButton + (copied() === server ? ' text-ok' : ' text-muted hover:text-ink')"
                            aria-label="Copy server"
                            [title]="copied() === server ? 'Copied' : 'Copy'"
                            (click)="copy(server)"
                          >
                            <amelu-icon [name]="copied() === server ? 'check' : 'copy'" [size]="12" />
                          </button>
                        </span>
                      </td>
                      <td [class]="ui.td + ' font-mono text-[12px] tabular-nums'">{{ row.port }}</td>
                      <td [class]="ui.td + ' whitespace-nowrap max-sm:hidden'">{{ row.security }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-[12px] leading-relaxed text-muted">
              IMAP keeps mail in sync on all your devices; use POP3 only if an app needs it, since it downloads mail to one
              device. If your app or network can't use port 465, use 587 with STARTTLS instead.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Calendar and contacts</h2>
          </div>
          <div [class]="ui.well">
            <dl class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              @for (row of dav; track row.label) {
                <div class="flex min-h-11 items-center gap-4 px-4 py-2">
                  <dt class="w-28 flex-none text-[13px] text-muted">{{ row.label }}</dt>
                  <dd class="flex min-w-0 flex-1 items-center gap-1">
                    <code class="min-w-0 truncate font-mono text-[12px]" [title]="row.value">{{ row.value }}</code>
                    <button
                      type="button"
                      [class]="copyButton + (copied() === row.value ? ' text-ok' : ' text-muted hover:text-ink')"
                      [attr.aria-label]="'Copy ' + row.label.toLowerCase()"
                      [title]="copied() === row.value ? 'Copied' : 'Copy'"
                      (click)="copy(row.value)"
                    >
                      <amelu-icon [name]="copied() === row.value ? 'check' : 'copy'" [size]="12" />
                    </button>
                  </dd>
                </div>
              }
            </dl>
            <p class="mt-3 text-[12px] leading-relaxed text-muted">Sign in with the same username and password as for mail.</p>
          </div>
        </section>
      </div>

      <aside class="space-y-5">
        @if (profileUrl(); as url) {
          <section id="phone" [class]="ui.panel">
            <div [class]="ui.panelHeader">
              <h2 [class]="ui.panelTitle">Set up your iPhone or iPad</h2>
            </div>
            <div [class]="ui.well">
              <p class="text-[13px] leading-relaxed text-muted">
                Point the camera at this code and tap the link. Install the profile in Settings and enter the mailbox
                password when asked.
              </p>
              <div class="mt-3 rounded-md border border-line bg-surface p-3">
                <amelu-phone-qr class="mx-auto max-w-[180px]" [url]="url" [label]="'QR code for the ' + (ctx.mailbox()?.address ?? '') + ' profile'" />
              </div>
              <p class="mt-3 text-[12px] leading-relaxed text-muted">
                On Android, add the account in Gmail or Outlook with the full address; most apps find the settings by
                themselves.
              </p>
            </div>
          </section>
        }

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Signing in</h2>
            <a [routerLink]="ctx.base() + '/password'" class="text-[13px] text-link hover:underline">Password</a>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              The username is always the full address. The password is the mailbox password, not your Amelu account
              password. You can set or reset it on the Password page.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Can't connect?</h2>
            <a [routerLink]="ctx.base() + '/services'" class="text-[13px] text-link hover:underline">Enabled services</a>
          </div>
          <div [class]="ui.well">
            <ul class="space-y-2 text-[13px] leading-relaxed text-muted">
              <li class="flex gap-2.5">
                <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60" aria-hidden="true"></span>
                Check that IMAP or ManageSieve is switched on for this mailbox.
              </li>
              <li class="flex gap-2.5">
                <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60" aria-hidden="true"></span>
                A suspended mailbox can't sign in until it's activated again.
              </li>
            </ul>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxUsage {
  // Seeing the instructions counts as setting up a device for the home checklist.
  constructor() {
    markSetupStep('device');
  }

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

  protected readonly server = MAIL_SERVER;
  protected readonly copyButton = 'inline-flex size-6 flex-none cursor-pointer items-center justify-center rounded hover:bg-bg';

  protected readonly login = computed((): Setting[] => [
    { label: 'Username', value: this.ctx.mailbox()?.address ?? '', copy: true },
    { label: 'Password', value: 'The mailbox password', muted: true },
  ]);

  protected readonly servers: { use: string; protocol: string; port: string; security: string }[] = [
    { use: 'Incoming mail', protocol: 'IMAP', port: '993', security: 'TLS' },
    { use: 'Incoming mail with POP3', protocol: 'POP3', port: '995', security: 'TLS' },
    { use: 'Outgoing mail', protocol: 'SMTP', port: '465', security: 'TLS' },
    { use: 'Outgoing mail with STARTTLS', protocol: 'SMTP', port: '587', security: 'STARTTLS' },
    { use: 'Mail filters', protocol: 'ManageSieve', port: '4190', security: 'STARTTLS' },
  ];

  protected readonly dav: Setting[] = [
    { label: 'Calendar', value: `https://${MAIL_SERVER}/dav/cal/` },
    { label: 'Contacts', value: `https://${MAIL_SERVER}/dav/card/` },
  ];

  protected async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.copied.set(value);
  }
}
