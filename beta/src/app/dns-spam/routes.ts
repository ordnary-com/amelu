import { Routes } from '@angular/router';
import { DnsOverview } from './dns-overview';
import { DnsRecords } from './dns-records';
import { SpamOverview } from './spam-overview';
import { SpamSubject } from './spam-subject';
import { SpamSenderLists } from './spam-sender-lists';
import { SpamRecipientDenylist } from './spam-recipient-denylist';

export const ROUTES: Routes = [
  { path: 'dns', component: DnsOverview, title: 'DNS setup · Amelu' },
  { path: 'dns/records', component: DnsRecords, title: 'DNS records · Amelu' },
  { path: 'spam', component: SpamOverview, title: 'Spam filtering · Amelu' },
  { path: 'spam/subject', component: SpamSubject, title: 'Aggressiveness · Amelu' },
  { path: 'spam/sender-lists', component: SpamSenderLists, title: 'Sender lists · Amelu' },
  { path: 'spam/recipient-denylist', component: SpamRecipientDenylist, title: 'Recipient denylist · Amelu' },
];
