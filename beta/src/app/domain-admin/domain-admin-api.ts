import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { DedicatedIp, Domain, DomainSending, SupportStatus } from '../api';

/** The fields of GET /api/domains that the shared Domain type leaves out. */
export interface DomainSettings extends Domain {
  notes: string;
  publiclyListed: boolean;
}

/** One entry in a domain's action history, newest first. */
export interface DomainAction {
  id: string;
  kind: 'sending_paused' | 'notice';
  /** Plain words for the customer; the sender guard's counts are left out. */
  reason: string;
  source: 'sender_guard' | 'staff';
  createdAt: string;
  liftedAt: string | null;
  active: boolean;
}

/** A request to review a sending pause: a support ticket of its own kind (category sending_review). */
export interface SendingReview {
  ticketId: string;
  number: number;
  status: SupportStatus;
  /** POST only: the domain already had an open review, so no new ticket was opened. */
  existing?: boolean;
}

export type SendingReviewCollection = 'customers' | 'signups' | 'purchased' | 'other';
export type SendingReviewVolume = 'lt100' | '100-1k' | '1k-10k' | 'gt10k';

/** POST /api/domains/{id}/status/review-request: the customer's answers. */
export interface SendingReviewRequest {
  sends: string;
  recipients: string;
  collection: SendingReviewCollection;
  collectionDetail: string;
  volume: SendingReviewVolume;
  changes: string;
  acceptPolicy: boolean;
}

/** GET /api/domains/{id}/status: anything we did that stops the domain from working normally. */
export interface DomainStatus {
  domain: { name: string; status: Domain['status'] };
  sending: {
    /** Read live from the mail server; unknown when it couldn't be reached. */
    state: 'ok' | 'paused' | 'unknown';
    pausedMailboxes: string[];
    /** null when the pause was never recorded. */
    since: string | null;
    reason: string | null;
  };
  account: { suspended: boolean; message?: string };
  dailyLimit: DomainSending;
  dedicatedIps: DedicatedIp[];
  actions: DomainAction[];
  /** The domain's sending review ticket that isn't closed yet. */
  review: SendingReview | null;
  /** Something here needs the customer's attention. */
  attention: boolean;
}

@Injectable({ providedIn: 'root' })
export class DomainAdminApi {
  private readonly http = inject(HttpClient);

  // There's no single-domain endpoint; the list carries notes and listing too.
  domainSettings(id: string) {
    return this.http
      .get<DomainSettings[]>('/api/domains')
      .pipe(map((domains) => domains.find((domain) => domain.id === id) ?? null));
  }

  status(id: string) {
    return this.http.get<DomainStatus>(`/api/domains/${id}/status`);
  }

  requestReview(id: string, answers: SendingReviewRequest) {
    return this.http.post<SendingReview>(`/api/domains/${id}/status/review-request`, answers);
  }

  updateNotes(id: string, notes: string) {
    return this.http.patch<{ notes: string }>(`/api/domains/${id}/notes`, { notes });
  }

  updateListing(id: string, publiclyListed: boolean) {
    return this.http.patch<{ publiclyListed: boolean }>(`/api/domains/${id}/listing`, { publiclyListed });
  }

  transfer(id: string, newOwnerEmail: string) {
    return this.http.post<{ ok: boolean }>(`/api/domains/${id}/transfer`, { newOwnerEmail });
  }

  deactivate(id: string) {
    return this.http.post<{ ok: boolean }>(`/api/domains/${id}/deactivate`, {});
  }

  reactivate(id: string) {
    return this.http.post<{ ok: boolean }>(`/api/domains/${id}/reactivate`, {});
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/domains/${id}`);
  }
}
