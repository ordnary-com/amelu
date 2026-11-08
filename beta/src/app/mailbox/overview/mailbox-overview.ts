import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../empty-state/empty-state';
import { MAILBOX_STATUS, badgeClass } from '../../status';
import { UI } from '../../ui';
import { MailboxApi } from '../mailbox-api';
import { Loaded, MailboxContext, perMailbox } from '../mailbox-context';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';
import { SaveFeedback, Saving } from '../shared/saving';
import { MAIL_SERVER } from '../usage/mailbox-usage';

interface Value {
  text: string;
  muted?: boolean;
  /** Shown as a status badge with this class. */
  badge?: string;
}

interface Stat {
  label: string;
  link: string;
  value: Loaded<string | number>;
  of?: number;
  muted?: boolean;
}

interface Row {
  label: string;
  value: Loaded<Value>;
  link?: string;
}

/** The current dashboard's MailboxOverviewPage: every setting at a glance, the name, and suspend/activate. */
@Component({
  selector: 'amelu-mailbox-overview',
  imports: [RouterLink, EmptyState, SaveFeedback, Icon, DitherShader],
  templateUrl: './mailbox-overview.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxOverview {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;
  protected readonly server = MAIL_SERVER;

  private readonly services = perMailbox((id) => this.api.services(id));
  private readonly internal = perMailbox((id) => this.api.internalAccess(id));
  private readonly forwards = perMailbox((id) => this.api.forwards(id));
  private readonly expiration = perMailbox((id) => this.api.expiration(id));
  protected readonly notes = perMailbox((id) => this.api.notes(id));

  protected readonly rows = computed<Row[]>(() => {
    const mailbox = this.ctx.mailbox();
    const services = this.services();
    const internal = this.internal();
    const forwards = this.forwards();
    const expiration = this.expiration();
    const status = mailbox ? MAILBOX_STATUS[mailbox.status] : null;
    const service = (key: 'maySend' | 'mayReceive' | 'mayImap' | 'mayPop3' | 'maySieve' | 'mayDav'): Loaded<Value> =>
      services && yesNo(services[key]);
    return [
      {
        label: 'Name',
        value: mailbox && (mailbox.displayName ? { text: mailbox.displayName } : { text: 'Not set', muted: true }),
      },
      { label: 'Address', value: mailbox && { text: mailbox.address } },
      { label: 'State', value: status && { text: status.label, badge: badgeClass(status.tone) } },
      { label: 'Internal access only', value: internal && yesNo(internal.internalAccessOnly), link: 'internal-access' },
      { label: 'May send', value: service('maySend'), link: 'services' },
      { label: 'May receive', value: service('mayReceive'), link: 'services' },
      { label: 'May access IMAP', value: service('mayImap'), link: 'services' },
      { label: 'May access POP3', value: service('mayPop3'), link: 'services' },
      { label: 'May access ManageSieve', value: service('maySieve'), link: 'services' },
      { label: 'Calendar and contacts', value: service('mayDav'), link: 'services' },
      {
        label: 'Forwarding',
        value:
          forwards &&
          (forwards.length
            ? { text: 'Active, to ' + forwards.map((f) => f.destination).join(', ') }
            : { text: 'Inactive', muted: true }),
        link: 'forwarding',
      },
      {
        label: 'Expires',
        value:
          expiration &&
          (expiration.expiresAt
            ? {
                text: `${formatDay(expiration.expiresAt)}, then ${expiration.removeUponExpiration ? 'erased' : 'suspended'}`,
              }
            : { text: 'Never', muted: true }),
        link: 'expiration',
      },
    ];
  });

  // The same settings as the rows below, the ones most worth seeing at a glance.
  protected readonly stats = computed<Stat[]>(() => {
    const services = this.services();
    const forwards = this.forwards();
    const internal = this.internal();
    const expiration = this.expiration();
    const enabled = services && Object.values(services).filter(Boolean).length;
    return [
      { label: 'Services on', link: 'services', value: enabled, of: services ? Object.keys(services).length : undefined },
      { label: 'Forwards', link: 'forwarding', value: forwards && forwards.length, muted: forwards?.length === 0 },
      {
        label: 'Internal access only',
        link: 'internal-access',
        value: internal && (internal.internalAccessOnly ? 'Yes' : 'No'),
        muted: internal ? !internal.internalAccessOnly : false,
      },
      {
        label: 'Expires',
        link: 'expiration',
        value: expiration && (expiration.expiresAt ? formatDay(expiration.expiresAt) : 'Never'),
        muted: expiration ? !expiration.expiresAt : false,
      },
    ];
  });

  protected readonly displayName = linkedSignal(() => this.ctx.mailbox()?.displayName ?? '');
  protected readonly nameChanged = computed(() => {
    const mailbox = this.ctx.mailbox();
    return !!mailbox && this.displayName().trim() !== mailbox.displayName;
  });
  protected readonly nameSave = new Saving();

  protected readonly statusSave = new Saving();

  protected async saveName(event: Event): Promise<void> {
    event.preventDefault();
    const updated = await this.nameSave.run(this.api.updateName(this.ctx.id(), this.displayName().trim()), 'Could not update name');
    if (updated) this.ctx.update(updated);
  }

  protected async toggleStatus(): Promise<void> {
    const mailbox = this.ctx.mailbox();
    if (!mailbox) return;
    const request = mailbox.status === 'active' ? this.api.suspend(mailbox.id) : this.api.activate(mailbox.id);
    const fallback = mailbox.status === 'active' ? 'Could not suspend mailbox' : 'Could not activate mailbox';
    const updated = await this.statusSave.run(request, fallback);
    if (updated) {
      this.ctx.update(updated);
      // The badge in the header already shows the change.
      this.statusSave.saved.set(false);
    }
  }
}

function yesNo(yes: boolean): Value {
  return { text: yes ? 'Yes' : 'No', badge: badgeClass(yes ? 'ok' : 'neutral') };
}

// expiresAt is a plain YYYY-MM-DD, so format it without a timezone shift.
function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
