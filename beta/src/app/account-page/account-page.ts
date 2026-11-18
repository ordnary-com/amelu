import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Session } from '../session';
import { ORDNARY_ACCOUNT_URL } from '../config';
import { ROLE, badgeClass } from '../status';
import { UI } from '../ui';
import { Icon } from '../icon';

/** The current dashboard's /account overview; the picture and name sit in the layout's banner. */
@Component({
  selector: 'amelu-account-page',
  imports: [DatePipe, RouterLink, Icon],
  templateUrl: './account-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AccountPage {
  protected readonly customer = inject(Session).customer;
  protected readonly ordnaryAccountUrl = ORDNARY_ACCOUNT_URL;
  protected readonly roles = ROLE;
  protected readonly ui = UI;
  // Label/value rows: the label as a muted row header.
  protected readonly key = 'w-48 px-4 py-3 text-left font-normal whitespace-nowrap text-muted max-mobile:w-32';
  protected readonly headerLink = 'inline-flex items-center gap-1 text-[13px] text-link hover:underline';

  protected badge(role: keyof typeof ROLE): string {
    return badgeClass(ROLE[role].tone);
  }
}
