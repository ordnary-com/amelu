import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { onboardingGuard } from './onboarding.guard';
import { Shell } from './shell/shell';
import { Home } from './home/home';
import { DomainDetail } from './domain-detail/domain-detail';
import { AccountPage } from './account-page/account-page';
import { AccountLayout } from './account-layout/account-layout';
import { BillingLayout } from './billing-layout/billing-layout';
import { BillingOverview } from './billing-overview/billing-overview';
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
    path: 'welcome',
    canActivate: [authGuard],
    loadComponent: () => import('./onboarding/onboarding').then((m) => m.Onboarding),
    title: 'Welcome · Amelu',
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard, onboardingGuard],
    children: [
      { path: '', component: Home, title: 'Overview · Amelu' },
      {
        path: 'domains',
        loadComponent: () => import('./domains-page/domains-page').then((m) => m.DomainsPage),
        title: 'Domains · Amelu',
      },
      { path: 'domains/new', loadComponent: () => import('./new-domain/new-domain').then((m) => m.NewDomain), title: 'New domain · Amelu' },
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
          {
            path: 'appearance',
            loadComponent: () => import('./account-appearance/account-appearance').then((m) => m.AccountAppearance),
            title: 'Appearance · My Account · Amelu' },
          { path: 'api-keys', loadComponent: () => import('./account-api-keys/account-api-keys').then((m) => m.AccountApiKeys), title: 'API Keys · My Account · Amelu' },
        ],
      },
      { path: 'organization', loadComponent: () => import('./organization-page/organization-page').then((m) => m.OrganizationPage), title: 'My Organization · Amelu' },
      { path: 'organization/activity', loadComponent: () => import('./activity-page/activity-page').then((m) => m.ActivityPage), title: 'Activity Log · Amelu' },
      {
        path: 'organization/webmail',
        loadComponent: () => import('./organization-webmail/organization-webmail').then((m) => m.OrganizationWebmail),
        title: 'Webmail · Amelu',
      },
      {
        path: 'billing',
        component: BillingLayout,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          { path: 'overview', component: BillingOverview, title: 'Billing · Amelu' },
          { path: 'plans', loadComponent: () => import('./billing-plans/billing-plans').then((m) => m.BillingPlans), title: 'Plans · Billing · Amelu' },
          { path: 'invoices', component: BillingInvoices, title: 'Invoices · Billing · Amelu' },
        ],
      },
      { path: 'network', loadComponent: () => import('./network-page/network-page').then((m) => m.NetworkPage), title: 'Sending IPs · Amelu' },
      { path: '', loadChildren: () => import('./misc/routes').then((m) => m.ROUTES) },
      { path: '**', component: NotFound, title: 'Page not found · Amelu' },
    ],
  },
];
