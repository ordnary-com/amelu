import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Session } from '../session';
import { ORDNARY_ACCOUNT_URL } from '../config';
import { ROLE, badgeClass } from '../status';
import { UI } from '../ui';
import { Icon } from '../icon';
import { DitherShader } from '../login/dither-shader';

/** The current dashboard's /account overview; the picture and name sit in the layout's banner. */
@Component({
  selector: 'amelu-account-page',
  imports: [DatePipe, RouterLink, Icon, DitherShader],
  templateUrl: './account-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AccountPage {
  protected readonly customer = inject(Session).customer;
  protected readonly ordnaryAccountUrl = ORDNARY_ACCOUNT_URL;
  protected readonly roles = ROLE;
  protected readonly ui = UI;
  protected readonly row = 'flex min-h-12 items-center gap-4 px-4 py-2.5';
  protected readonly label = 'w-40 flex-none text-muted max-mobile:w-28';
  protected readonly note = 'flex-none text-[12px] text-muted max-mobile:hidden';

  protected badge(role: keyof typeof ROLE): string {
    return badgeClass(ROLE[role].tone);
  }
}
