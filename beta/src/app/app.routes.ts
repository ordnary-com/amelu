import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { Shell } from './shell/shell';
import { Home } from './home/home';
import { DomainsPage } from './domains-page/domains-page';
import { DomainDetail } from './domain-detail/domain-detail';
import { NewDomain } from './new-domain/new-domain';
import { NotFound } from './not-found/not-found';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', component: Home, title: 'Amelu' },
      { path: 'domains', component: DomainsPage, title: 'Email Domains · Amelu' },
      { path: 'domains/new', component: NewDomain, title: 'New domain · Amelu' },
      { path: 'domains/:domainId', component: DomainDetail, title: 'Domain · Amelu' },
      { path: '**', component: NotFound, title: 'Page not found · Amelu' },
    ],
  },
];
