import {
  HttpClient,
  HttpErrorResponse,
  HttpEvent,
  HttpHeaders,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

// Shapes as returned by the Go API's /api/webmail/* (docs/WEBMAIL.md).

export interface Account {
  email: string;
  displayName: string;
  domain: string;
  quota: { usedBytes: number; maxBytes: number } | null;
}

export type FolderRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive';

export interface Folder {
  id: string;
  name: string;
  role?: FolderRole;
  parentId?: string;
  unread: number;
  total: number;
  sortOrder: number;
}

export interface Addr {
  name?: string;
  email: string;
}

export interface Summary {
  id: string;
  threadId: string;
  subject: string;
  from: Addr[];
  to: Addr[];
  receivedAt: string;
  preview: string;
  hasAttachments: boolean;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  forwarded: boolean;
  draft: boolean;
  size: number;
  folderIds: string[];
}

export interface Attachment {
  blobId: string;
  name: string;
  type: string;
  size: number;
  cid?: string;
  inline: boolean;
}

export interface Message extends Summary {
  cc: Addr[];
  bcc: Addr[];
  replyTo: Addr[];
  messageId: string[];
  inReplyTo: string[];
  references: string[];
  sentAt: string;
  textBody: string;
  htmlBody: string;
  attachments: Attachment[];
}

export interface MessagePage {
  messages: Summary[];
  total: number;
  position: number;
}

export interface MessageQuery {
  folder?: string;
  position?: number;
  limit?: number;
  q?: string;
  unread?: boolean;
  flagged?: boolean;
}

export interface DraftAttachment {
  blobId: string;
  name: string;
  type: string;
  size: number;
}

export interface Draft {
  to: Addr[];
  cc: Addr[];
  bcc: Addr[];
  subject: string;
  text: string;
  html?: string;
  attachments: DraftAttachment[];
  inReplyTo?: string;
  references?: string[];
  replyToId?: string;
  forwardOfId?: string;
}

export interface UploadedBlob {
  blobId: string;
  name: string;
  type: string;
  size: number;
}

export interface Identity {
  name: string;
  textSignature: string;
  htmlSignature: string;
}

export interface Vacation {
  enabled: boolean;
  subject: string;
  text: string;
  from?: string;
  to?: string;
}

export interface Settings {
  identity: Identity;
  vacation: Vacation;
}

// Mirrors the Go API's error body (handlers/json.go).
export interface ApiErrorBody {
  error: string;
  code?: string;
  status?: number;
  requestId?: string;
  detail?: string;
}

/**
 * The API's error sentence, or the fallback when there isn't one. Server
 * faults get the request id appended so a person can quote it.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof HttpErrorResponse) || typeof err.error?.error !== 'string') return fallback;
  const body = err.error as ApiErrorBody;
  if (err.status >= 500 && body.requestId) return `${body.error} (request ${body.requestId})`;
  return body.error;
}

/** The API's stable error code, e.g. INVALID_CREDENTIALS, if the response carried one. */
export function errorCode(err: unknown): string | undefined {
  if (err instanceof HttpErrorResponse && typeof err.error?.code === 'string')
    return err.error.code;
  return undefined;
}

const BASE = '/api/webmail';

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  login(email: string, password: string) {
    return this.http.post<Account>(`${BASE}/login`, { email, password });
  }

  logout() {
    return this.http.post<void>(`${BASE}/logout`, {});
  }

  me() {
    return this.http.get<Account>(`${BASE}/me`);
  }

  listFolders() {
    return this.http.get<{ folders: Folder[] }>(`${BASE}/folders`);
  }

  createFolder(name: string, parentId?: string) {
    return this.http.post<Folder>(`${BASE}/folders`, parentId ? { name, parentId } : { name });
  }

  renameFolder(id: string, name: string) {
    return this.http.patch<Folder>(`${BASE}/folders/${id}`, { name });
  }

  deleteFolder(id: string) {
    return this.http.delete<void>(`${BASE}/folders/${id}`);
  }

  listMessages(query: MessageQuery) {
    const params: Record<string, string> = {};
    if (query.folder) params['folder'] = query.folder;
    if (query.position) params['position'] = String(query.position);
    if (query.limit) params['limit'] = String(query.limit);
    if (query.q) params['q'] = query.q;
    if (query.unread) params['unread'] = '1';
    if (query.flagged) params['flagged'] = '1';
    return this.http.get<MessagePage>(`${BASE}/messages`, { params });
  }

  getMessage(id: string) {
    return this.http.get<Message>(`${BASE}/messages/${id}`);
  }

  setFlags(ids: string[], flags: { seen?: boolean; flagged?: boolean }) {
    return this.http.post<void>(`${BASE}/messages/flags`, { ids, ...flags });
  }

  move(ids: string[], folderId: string) {
    return this.http.post<void>(`${BASE}/messages/move`, { ids, folderId });
  }

  delete(ids: string[]) {
    return this.http.post<void>(`${BASE}/messages/delete`, { ids });
  }

  spam(ids: string[], spam: boolean) {
    return this.http.post<void>(`${BASE}/messages/spam`, { ids, spam });
  }

  /** Uploads one file; the events carry progress, the last one the blob. */
  upload(file: File): Observable<HttpEvent<UploadedBlob>> {
    const req = new HttpRequest('POST', `${BASE}/blobs`, file, {
      headers: new HttpHeaders({
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      }),
      reportProgress: true,
    });
    return this.http.request<UploadedBlob>(req);
  }

  createDraft(draft: Draft) {
    return this.http.post<{ id: string }>(`${BASE}/drafts`, draft);
  }

  updateDraft(id: string, draft: Draft) {
    return this.http.put<{ id: string }>(`${BASE}/drafts/${id}`, draft);
  }

  deleteDraft(id: string) {
    return this.http.delete<void>(`${BASE}/drafts/${id}`);
  }

  send(draft: Draft, draftId?: string) {
    return this.http.post<{ id: string }>(`${BASE}/send`, draftId ? { draft, draftId } : { draft });
  }

  getSettings() {
    return this.http.get<Settings>(`${BASE}/settings`);
  }

  saveIdentity(name: string, textSignature: string) {
    return this.http.put<void>(`${BASE}/settings/identity`, { name, textSignature });
  }

  saveVacation(vacation: Vacation) {
    return this.http.put<void>(`${BASE}/settings/vacation`, vacation);
  }

  changePassword(current: string, next: string) {
    return this.http.post<void>(`${BASE}/settings/password`, { current, new: next });
  }
}

/** A plain link to an attachment, for downloads and inline images. */
export function blobUrl(blobId: string, name: string, type: string, inline = false): string {
  const query = new URLSearchParams({ name, type });
  if (inline) query.set('inline', '1');
  return `${BASE}/blobs/${encodeURIComponent(blobId)}?${query}`;
}

/** The original message as an .eml download. */
export function rawUrl(id: string): string {
  return `${BASE}/messages/${encodeURIComponent(id)}/raw`;
}
