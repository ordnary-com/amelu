import { Routes } from '@angular/router';
import { DomainActivity } from './domain-activity';
import { TransferDomain } from './transfer-domain';
import { DeactivateDomain } from './deactivate-domain';
import { DeleteDomain } from './delete-domain';
import { ListingSettings } from './listing-settings';
import { DomainNotes } from './domain-notes';
import { DomainStatusPage } from './domain-status';
import { SendingReviewPage } from './sending-review';

export const ROUTES: Routes = [
  { path: 'activity', component: DomainActivity, title: 'Recent activity · Amelu' },
  { path: 'status', component: DomainStatusPage, title: 'Domain status · Amelu' },
  { path: 'status/review', component: SendingReviewPage, title: 'Request a review · Amelu' },
  { path: 'transfer', component: TransferDomain, title: 'Transfer ownership · Amelu' },
  { path: 'deactivate', component: DeactivateDomain, title: 'Deactivate domain · Amelu' },
  { path: 'delete', component: DeleteDomain, title: 'Delete domain · Amelu' },
  { path: 'listing-settings', component: ListingSettings, title: 'Listing settings · Amelu' },
  { path: 'notes', component: DomainNotes, title: 'Attached notes · Amelu' },
];
