import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { Shell } from './shell/shell';
import { Home } from './home/home';
import { DomainDetail } from './domain-detail/domain-detail';
import { NewDomain } from './new-domain/new-domain';
import { AccountPage } from './account-page/account-page';
import { AccountLayout } from './account-layout/account-layout';
import { AccountAppearance } from './account-appearance/account-appearance';
import { AccountApiKeys } from './account-api-keys/account-api-keys';
import { OrganizationPage } from './organization-page/organization-page';
import { ActivityPage } from './activity-page/activity-page';
import { BillingLayout } from './billing-layout/billing-layout';
import { BillingOverview } from './billing-overview/billing-overview';
import { BillingPlans } from './billing-plans/billing-plans';
import { BillingInvoices } from './billing-invoices/billing-invoices';
import { NotFound } from './not-found/not-found';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login').then((m) => m.Login), title: 'Sign in · Amelu' },
  // Links the API emails; no session needed.
  {
    path: 'reset-password/:token',
    loadComponent: () => import('./token-pages/reset-password').then((m) => m.ResetPassword),
    title: 'Set a password · Amelu',
  },
  {
    path: 'accept-invite/:token',
    loadComponent: () => import('./token-pages/accept-invite').then((m) => m.AcceptInvite),
    title: 'Accept invitation · Amelu',
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', component: Home, title: 'Amelu' },
      {
        path: 'domains',
        loadComponent: () => import('./domains-page/domains-page').then((m) => m.DomainsPage),
        title: 'Email Domains · Amelu',
      },
      { path: 'domains/new', component: NewDomain, title: 'New domain · Amelu' },
      {
        path: 'domains/:domainId',
        // Each group loads on first use. mailboxes before mailbox: mailboxes/new must win over mailboxes/:mailboxId.
        children: [
          { path: '', pathMatch: 'full', component: DomainDetail, title: 'Domain · Amelu' },
          { path: '', loadChildren: () => import('./mailboxes/routes').then((m) => m.ROUTES) },
          { path: '', loadChildren: () => import('./mailbox/routes').then((m) => m.ROUTES) },
          { path: '', loadChildren: () => import('./routing/routes').then((m) => m.ROUTES) },
          { path: '', loadChildren: () => import('./dns-spam/routes').then((m) => m.ROUTES) },
          { path: '', loadChildren: () => import('./domain-admin/routes').then((m) => m.ROUTES) },
        ],
      },
      {
        path: 'account',
        component: AccountLayout,
        children: [
          { path: '', component: AccountPage, title: 'My Account · Amelu' },
          { path: 'appearance', component: AccountAppearance, title: 'Appearance · My Account · Amelu' },
          { path: 'api-keys', component: AccountApiKeys, title: 'API Keys · My Account · Amelu' },
        ],
      },
      { path: 'organization', component: OrganizationPage, title: 'My Organization · Amelu' },
      { path: 'organization/activity', component: ActivityPage, title: 'Activity Log · Amelu' },
      {
        path: 'billing',
        component: BillingLayout,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          { path: 'overview', component: BillingOverview, title: 'Billing · Amelu' },
          { path: 'plans', component: BillingPlans, title: 'Plans · Billing · Amelu' },
          { path: 'invoices', component: BillingInvoices, title: 'Invoices · Billing · Amelu' },
        ],
      },
      { path: '', loadChildren: () => import('./misc/routes').then((m) => m.ROUTES) },
      { path: '**', component: NotFound, title: 'Page not found · Amelu' },
    ],
  },
];
