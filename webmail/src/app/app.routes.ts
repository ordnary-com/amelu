import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { Shell } from './shell/shell';
import { MailPane } from './mail/mail-pane';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login').then((m) => m.Login),
    title: 'Sign in · Amelu Webmail',
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', component: MailPane, title: 'Inbox · Amelu Webmail' },
      { path: 'folder/:folderId', component: MailPane, title: 'Mail · Amelu Webmail' },
      { path: 'folder/:folderId/:messageId', component: MailPane, title: 'Mail · Amelu Webmail' },
      { path: 'search', component: MailPane, title: 'Search · Amelu Webmail' },
      {
        path: 'compose',
        loadComponent: () => import('./compose/compose').then((m) => m.Compose),
        title: 'New message · Amelu Webmail',
      },
      {
        path: 'settings',
        loadChildren: () => import('./settings/routes').then((m) => m.ROUTES),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
