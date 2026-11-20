import { RouterLink } from '@angular/router';
import { EmptyState } from '../empty-state/empty-state';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Api } from '../api';
import { INVOICE_STATUS, TONE_ICON, TONE_TEXT, badgeClass } from '../status';
import { UI } from '../ui';
import { Icon } from '../icon';

/** The current dashboard's /billing/invoices, synced from Stripe. */
@Component({
  selector: 'amelu-billing-invoices',
  imports: [EmptyState, RouterLink, CurrencyPipe, DatePipe, Icon],
  templateUrl: './billing-invoices.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BillingInvoices {
  protected readonly ui = UI;
  protected readonly badge = badgeClass;
  protected readonly invoiceStatus = INVOICE_STATUS;
  protected readonly toneText = TONE_TEXT;
  protected readonly toneIcon = TONE_ICON;
  // undefined while loading, null when the request failed
  protected readonly invoices = toSignal(inject(Api).listInvoices().pipe(catchError(() => of(null))));
}
