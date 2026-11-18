import { Routes } from '@angular/router';
import { SupportHome } from '../support/support-home';
import { SupportNew } from '../support/support-new';
import { SupportTicketPage } from '../support/support-ticket';
import { Changelog } from './changelog';
import { StatusPage } from './status-page';

export const ROUTES: Routes = [
  { path: 'support', component: SupportHome, title: 'Support · Amelu' },
  { path: 'support/new', component: SupportNew, title: 'New ticket · Support · Amelu' },
  { path: 'support/tickets/:id', component: SupportTicketPage, title: 'Ticket · Support · Amelu' },
  { path: 'changelog', component: Changelog, title: "What's new · Amelu" },
  { path: 'status', component: StatusPage, title: 'Service status · Amelu' },
];
