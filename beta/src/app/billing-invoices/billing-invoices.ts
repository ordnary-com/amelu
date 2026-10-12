import { RouterLink } from '@angular/router';
import { EmptyState } from '../empty-state/empty-state';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Api } from '../api';
import { INVOICE_STATUS, badgeClass } from '../status';
import { UI } from '../ui';

/** The current dashboard's /billing/invoices, synced from Stripe. */
@Component({
  selector: 'amelu-billing-invoices',
  imports: [EmptyState, RouterLink, CurrencyPipe, DatePipe],
  templateUrl: './billing-invoices.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BillingInvoices {
  protected readonly ui = UI;
  protected readonly badge = badgeClass;
  protected readonly invoiceStatus = INVOICE_STATUS;
  // undefined while loading, null when the request failed
  protected readonly invoices = toSignal(inject(Api).listInvoices().pipe(catchError(() => of(null))));
}
