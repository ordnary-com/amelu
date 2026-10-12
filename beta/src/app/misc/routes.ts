import { Routes } from '@angular/router';
import { Support } from './support';
import { Changelog } from './changelog';
import { StatusPage } from './status-page';
import { TerminateAccount } from './terminate-account';

export const ROUTES: Routes = [
  { path: 'support', component: Support, title: 'Support · Amelu' },
  { path: 'changelog', component: Changelog, title: 'Changelog · Amelu' },
  { path: 'status', component: StatusPage, title: 'Service Status · Amelu' },
  { path: 'account/terminate', component: TerminateAccount, title: 'Terminate account · My Account · Amelu' },
];
