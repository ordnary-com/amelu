import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_ORIGIN } from '../config';

/** GET /api/organization/webmail: the organization's own webmail (docs/WEBMAIL.md). */
export interface WebmailBranding {
  allowed: boolean;
  canManage: boolean;
  enabled: boolean;
  subdomain: string;
  subdomainSuffix: string;
  url: string;
  customHostnamesAvailable: boolean;
  customHostname: string;
  customHostnameStatus: '' | 'pending' | 'active' | 'failed';
  customHostnameError: string;
  cnameTarget: string;
  productName: string;
  accentColor: string;
  supportUrl: string;
  hasLogo: boolean;
  logoVersion: number;
}

export interface WebmailBrandingUpdate {
  enabled: boolean;
  subdomain: string;
  productName: string;
  accentColor: string;
  supportUrl: string;
}

@Injectable({ providedIn: 'root' })
export class WebmailApi {
  private readonly http = inject(HttpClient);

  get() {
    return this.http.get<WebmailBranding>('/api/organization/webmail');
  }

  update(input: WebmailBrandingUpdate) {
    return this.http.put<WebmailBranding>('/api/organization/webmail', input);
  }

  uploadLogo(file: File) {
    return this.http.put<WebmailBranding>('/api/organization/webmail/logo', file, { headers: { 'Content-Type': file.type } });
  }

  deleteLogo() {
    return this.http.delete<WebmailBranding>('/api/organization/webmail/logo');
  }

  setHostname(hostname: string) {
    return this.http.put<WebmailBranding>('/api/organization/webmail/custom-hostname', { hostname });
  }

  removeHostname() {
    return this.http.delete<WebmailBranding>('/api/organization/webmail/custom-hostname');
  }

  /** The dashboard's preview of the uploaded logo; the version busts the cache. */
  logoUrl(version: number): string {
    return `${API_ORIGIN}/api/organization/webmail/logo?v=${version}`;
  }
}
