import { Routes } from '@angular/router';
import { SettingsLayout } from './settings-layout';
import { IdentitySettings } from './identity-settings';
import { VacationSettings } from './vacation-settings';
import { PasswordSettings } from './password-settings';

export const ROUTES: Routes = [
  {
    path: '',
    component: SettingsLayout,
    children: [
      { path: '', component: IdentitySettings, title: 'Settings · Amelu Webmail' },
      {
        path: 'vacation',
        component: VacationSettings,
        title: 'Out of office · Settings · Amelu Webmail',
      },
      {
        path: 'password',
        component: PasswordSettings,
        title: 'Password · Settings · Amelu Webmail',
      },
    ],
  },
];
