import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ActivityEntry, Mailbox } from '../api';

// Shapes as returned by backend/internal/handlers/mailbox_settings.go.

export interface EnabledServices {
  maySend: boolean;
  mayReceive: boolean;
  mayImap: boolean;
  mayPop3: boolean;
  maySieve: boolean;
}

export interface MailboxForward {
  id: string;
  destination: string;
}

export interface MailboxListing {
  /** The mailbox's display name. */
  name: string;
  tags: string;
}

export interface Identity {
  id: string;
  name: string;
  email: string;
}

export interface RecentEmail {
  id: string;
  subject: string;
  // Go encodes an empty address list as null.
  from: string[] | null;
  to: string[] | null;
  receivedAt: string;
}

export interface RecentLogs {
  incoming: RecentEmail[];
  outgoing: RecentEmail[];
}

export interface MailboxExpiration {
  /** YYYY-MM-DD, or null when the mailbox never expires. */
  expiresAt: string | null;
  removeUponExpiration: boolean;
}

export interface MailboxLimits {
  maxEmails: number;
  maxDiskQuotaBytes: number;
}

export interface RepairResult {
  address: string;
  domainRecreated: boolean;
  mailboxRecreated: boolean;
  /** Only when the mailbox was recreated: the new password, shown once. */
  password?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class MailboxApi {
  private readonly http = inject(HttpClient);

  /** Recreates the mailbox (and its domain) in the mail cluster when the cluster lost it. */
  repair(id: string) {
    return this.http.post<RepairResult>(`/api/mailboxes/${id}/repair`, {});
  }

  get(id: string) {
    return this.http.get<Mailbox>(`/api/mailboxes/${id}`);
  }

  updateName(id: string, displayName: string) {
    return this.http.patch<Mailbox>(`/api/mailboxes/${id}/name`, { displayName });
  }

  suspend(id: string) {
    return this.http.post<Mailbox>(`/api/mailboxes/${id}/suspend`, {});
  }

  activate(id: string) {
    return this.http.post<Mailbox>(`/api/mailboxes/${id}/activate`, {});
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/mailboxes/${id}`);
  }

  activity(id: string) {
    return this.http.get<ActivityEntry[]>(`/api/mailboxes/${id}/activity`);
  }

  logs(id: string) {
    return this.http.get<RecentLogs>(`/api/mailboxes/${id}/logs`);
  }

  services(id: string) {
    return this.http.get<EnabledServices>(`/api/mailboxes/${id}/services`);
  }

  updateServices(id: string, services: EnabledServices) {
    return this.http.put<EnabledServices>(`/api/mailboxes/${id}/services`, services);
  }

  setPassword(id: string, password: string) {
    return this.http.post<{ ok: boolean }>(`/api/mailboxes/${id}/password`, { password });
  }

  invitePassword(id: string, email: string) {
    return this.http.post<{ ok: boolean }>(`/api/mailboxes/${id}/password/invite`, { email });
  }

  internalAccess(id: string) {
    return this.http.get<{ internalAccessOnly: boolean }>(`/api/mailboxes/${id}/internal-access`);
  }

  updateInternalAccess(id: string, internalAccessOnly: boolean) {
    return this.http.put<{ internalAccessOnly: boolean }>(`/api/mailboxes/${id}/internal-access`, { internalAccessOnly });
  }

  delegation(id: string) {
    return this.http.get<{ delegation: string }>(`/api/mailboxes/${id}/delegation`);
  }

  updateDelegation(id: string, delegation: string) {
    return this.http.put<{ delegation: string }>(`/api/mailboxes/${id}/delegation`, { delegation });
  }

  forwards(id: string) {
    return this.http.get<MailboxForward[]>(`/api/mailboxes/${id}/forwards`);
  }

  createForward(id: string, destination: string) {
    return this.http.post<MailboxForward>(`/api/mailboxes/${id}/forwards`, { destination });
  }

  deleteForward(id: string, forwardId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/mailboxes/${id}/forwards/${forwardId}`);
  }

  listing(id: string) {
    return this.http.get<MailboxListing>(`/api/mailboxes/${id}/listing`);
  }

  updateListing(id: string, listing: MailboxListing) {
    return this.http.put<MailboxListing>(`/api/mailboxes/${id}/listing`, listing);
  }

  notes(id: string) {
    return this.http.get<{ notes: string }>(`/api/mailboxes/${id}/notes`);
  }

  updateNotes(id: string, notes: string) {
    return this.http.put<{ notes: string }>(`/api/mailboxes/${id}/notes`, { notes });
  }

  identities(id: string) {
    return this.http.get<Identity[]>(`/api/mailboxes/${id}/identities`);
  }

  createIdentity(id: string, name: string, email: string) {
    return this.http.post<Identity>(`/api/mailboxes/${id}/identities`, { name, email });
  }

  deleteIdentity(id: string, identityId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/mailboxes/${id}/identities/${identityId}`);
  }

  expiration(id: string) {
    return this.http.get<MailboxExpiration>(`/api/mailboxes/${id}/expiration`);
  }

  updateExpiration(id: string, expiration: MailboxExpiration) {
    return this.http.put<MailboxExpiration>(`/api/mailboxes/${id}/expiration`, expiration);
  }

  limits(id: string) {
    return this.http.get<MailboxLimits>(`/api/mailboxes/${id}/limits`);
  }

  updateLimits(id: string, limits: MailboxLimits) {
    return this.http.put<MailboxLimits>(`/api/mailboxes/${id}/limits`, limits);
  }
}
