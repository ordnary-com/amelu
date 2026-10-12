import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { Shell } from './shell/shell';
import { NotFound } from './not-found/not-found';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '**', component: NotFound, title: 'Page not found · Amelu' },
    ],
  },
];
