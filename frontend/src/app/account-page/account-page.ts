import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Session } from '../session';
import { ORDNARY_ACCOUNT_URL } from '../config';
import { ROLE, badgeClass } from '../status';
import { UI } from '../ui';
import { Icon } from '../icon';

/** /account: profile, email, two-step verification and password, all managed in the Ordnary account. */
@Component({
  selector: 'amelu-account-page',
  imports: [DatePipe, Icon],
  templateUrl: './account-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AccountPage {
  protected readonly customer = inject(Session).customer;
  protected readonly ordnaryAccountUrl = ORDNARY_ACCOUNT_URL;
  protected readonly roles = ROLE;
  protected readonly ui = UI;
  // Cards with a title bar and an action icon, label-over-value fields and grey notes.
  protected readonly card = UI.setCard;
  protected readonly cardHeader = UI.setHeader;
  protected readonly cardTitle = UI.setTitle;
  protected readonly headerAction = UI.setAction;
  protected readonly field = 'min-w-0 px-5 py-4 max-sm:not-first:border-t max-sm:not-first:border-line';
  protected readonly fieldLabel = 'text-[13px] text-muted';
  protected readonly fieldValue = 'mt-1 truncate text-[16px]';
  protected readonly note = UI.setNote;

  protected badge(role: keyof typeof ROLE): string {
    return badgeClass(ROLE[role].tone);
  }
}
