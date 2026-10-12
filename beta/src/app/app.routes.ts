import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { Shell } from './shell/shell';
import { Home } from './home/home';
import { DomainsPage } from './domains-page/domains-page';
import { DomainDetail } from './domain-detail/domain-detail';
import { NewDomain } from './new-domain/new-domain';
import { AccountPage } from './account-page/account-page';
import { AccountLayout } from './account-layout/account-layout';
import { AccountAppearance } from './account-appearance/account-appearance';
import { AccountApiKeys } from './account-api-keys/account-api-keys';
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
      {
        path: 'account',
        component: AccountLayout,
        children: [
          { path: '', component: AccountPage, title: 'My Account · Amelu' },
          { path: 'appearance', component: AccountAppearance, title: 'Appearance · My Account · Amelu' },
          { path: 'api-keys', component: AccountApiKeys, title: 'API Keys · My Account · Amelu' },
        ],
      },
      { path: '**', component: NotFound, title: 'Page not found · Amelu' },
    ],
  },
];
