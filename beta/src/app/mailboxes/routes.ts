import { Routes } from '@angular/router';
import { MailboxesPage } from './mailboxes-page/mailboxes-page';
import { NewMailbox } from './new-mailbox/new-mailbox';
import { ImportMailboxes } from './import-mailboxes/import-mailboxes';
import { DefaultServices } from './default-services/default-services';
import { DefaultLimits } from './default-limits/default-limits';

export const ROUTES: Routes = [
  { path: 'mailboxes', component: MailboxesPage, title: 'Mailboxes · Amelu' },
  { path: 'mailboxes/new', component: NewMailbox, title: 'New mailbox · Amelu' },
  { path: 'mailboxes/import', component: ImportMailboxes, title: 'Import mailboxes · Amelu' },
  { path: 'mailboxes/services', component: DefaultServices, title: 'Default services · Amelu' },
  { path: 'mailboxes/limits', component: DefaultLimits, title: 'Default limits · Amelu' },
];
