import { Routes } from '@angular/router';
import { MailboxLayout } from './mailbox-layout';
import { MailboxOverview } from './overview/mailbox-overview';
import { MailboxActivity } from './activity/mailbox-activity';
import { MailboxLogs } from './activity/mailbox-logs';
import { MailboxUsage } from './usage/mailbox-usage';
import { MailboxServices } from './security/mailbox-services';
import { MailboxPassword } from './security/mailbox-password';
import { MailboxInternalAccess } from './security/mailbox-internal-access';
import { MailboxIdentities } from './delivery/mailbox-identities';
import { MailboxForwarding } from './delivery/mailbox-forwarding';
import { MailboxDelegation } from './delivery/mailbox-delegation';
import { MailboxLimits } from './settings/mailbox-limits';
import { MailboxExpiration } from './settings/mailbox-expiration';
import { MailboxListingSettings } from './settings/mailbox-listing-settings';
import { MailboxNotes } from './settings/mailbox-notes';
import { DeleteMailbox } from './settings/delete-mailbox';

// Child paths are the current dashboard's, so old links keep working.
export const ROUTES: Routes = [
  {
    path: 'mailboxes/:mailboxId',
    component: MailboxLayout,
    children: [
      { path: '', component: MailboxOverview, title: 'Mailbox · Amelu' },
      { path: 'activity', component: MailboxActivity, title: 'Recent activity · Amelu' },
      { path: 'logs', component: MailboxLogs, title: 'Recent traffic logs · Amelu' },
      { path: 'usage', component: MailboxUsage, title: 'Usage instructions · Amelu' },
      { path: 'services', component: MailboxServices, title: 'Enabled services · Amelu' },
      { path: 'limits', component: MailboxLimits, title: 'Mailbox limits · Amelu' },
      { path: 'password', component: MailboxPassword, title: 'Mailbox password · Amelu' },
      { path: 'internal-access', component: MailboxInternalAccess, title: 'Internal access · Amelu' },
      { path: 'identities', component: MailboxIdentities, title: 'Identities · Amelu' },
      { path: 'forwarding', component: MailboxForwarding, title: 'Forwarding · Amelu' },
      { path: 'delegation', component: MailboxDelegation, title: 'Delegations · Amelu' },
      { path: 'expiration', component: MailboxExpiration, title: 'Mailbox expiration · Amelu' },
      { path: 'listing-settings', component: MailboxListingSettings, title: 'Listing settings · Amelu' },
      { path: 'notes', component: MailboxNotes, title: 'Attached notes · Amelu' },
      { path: 'delete', component: DeleteMailbox, title: 'Delete mailbox · Amelu' },
    ],
  },
];
