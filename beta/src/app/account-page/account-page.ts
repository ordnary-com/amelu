import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Session } from '../session';
import { ORDNARY_ACCOUNT_URL } from '../config';
import { ROLE } from '../status';

/** The current dashboard's /account overview, in the console page layout. */
@Component({
  selector: 'amelu-account-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './account-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AccountPage {
  protected readonly customer = inject(Session).customer;
  protected readonly ordnaryAccountUrl = ORDNARY_ACCOUNT_URL;
  protected readonly roles = ROLE;
  protected readonly avatarFailed = signal(false);
  protected readonly row = 'flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0';
  protected readonly label = 'w-40 flex-none text-muted';
  protected readonly action = 'flex-none text-[12px] font-medium text-link hover:underline';


  protected readonly initials = computed(() => {
    const customer = this.customer();
    const source = (customer?.name || customer?.email || '').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  });
}
