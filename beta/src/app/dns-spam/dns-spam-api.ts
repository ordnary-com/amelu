import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface DomainConnectStatus {
  supported: boolean;
  applyUrl?: string;
}

export interface SpamOverview {
  subjectRewrite: boolean;
  junkIfSubjectSpam: boolean;
  senderDenylistCount: number;
  senderJunklistCount: number;
  recipientDenylistCount: number;
}

export interface SpamSubjectSettings {
  subjectRewrite: boolean;
  junkIfSubjectSpam: boolean;
}

/** Newline-separated entries, stored and returned as one string. */
export interface SpamSenderLists {
  denylist: string;
  junklist: string;
}

export interface SpamRecipientDenylist {
  denylist: string;
}

@Injectable({ providedIn: 'root' })
export class DnsSpamApi {
  private readonly http = inject(HttpClient);

  domainConnect(domainId: string) {
    return this.http.get<DomainConnectStatus>(`/api/domains/${domainId}/domain-connect`);
  }

  bindFileUrl(domainId: string): string {
    return `/api/domains/${domainId}/bind`;
  }

  spamOverview(domainId: string) {
    return this.http.get<SpamOverview>(`/api/domains/${domainId}/spam/overview`);
  }

  spamSubjectSettings(domainId: string) {
    return this.http.get<SpamSubjectSettings>(`/api/domains/${domainId}/spam/subject-settings`);
  }

  updateSpamSubjectSettings(domainId: string, settings: SpamSubjectSettings) {
    return this.http.put<SpamSubjectSettings>(`/api/domains/${domainId}/spam/subject-settings`, settings);
  }

  spamSenderLists(domainId: string) {
    return this.http.get<SpamSenderLists>(`/api/domains/${domainId}/spam/sender-lists`);
  }

  updateSpamSenderLists(domainId: string, lists: SpamSenderLists) {
    return this.http.put<SpamSenderLists>(`/api/domains/${domainId}/spam/sender-lists`, lists);
  }

  spamRecipientDenylist(domainId: string) {
    return this.http.get<SpamRecipientDenylist>(`/api/domains/${domainId}/spam/recipient-denylist`);
  }

  updateSpamRecipientDenylist(domainId: string, list: SpamRecipientDenylist) {
    return this.http.put<SpamRecipientDenylist>(`/api/domains/${domainId}/spam/recipient-denylist`, list);
  }
}

/** Same splitting as the API's parseListField: one entry per non-blank line. */
export function listEntries(field: string): string[] {
  return field
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
