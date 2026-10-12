import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

// Shapes as returned by the Go API; kept in step with frontend/src/api/client.ts.

export interface Customer {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  planTierName: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
  lastSignInAt?: string;
  /** Ordnary profile picture; set from the next Ordnary login on. */
  avatarUrl?: string;
}

export type OrganizationRole = 'owner' | 'admin' | 'helpdesk' | 'billing' | 'read_only';

export interface Member {
  id: string;
  email: string;
  name: string;
  role: OrganizationRole;
  createdAt: string;
  isSelf: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: OrganizationRole;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface CreateInvitationResult extends Invitation {
  emailSent: boolean;
  devInviteUrl?: string;
}

export interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  objectType: string;
  objectId?: string;
  objectLabel?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Domain {
  id: string;
  name: string;
  status: 'provisioning' | 'dns_pending' | 'active' | 'failed' | 'suspended';
  createdAt: string;
  verifiedAt?: string;
}

export interface DnsRecordCheck {
  type: string;
  name: string;
  expected: string;
  actual?: string[];
  status: 'matched' | 'mismatch' | 'missing' | 'unchecked';
}

export interface Mailbox {
  id: string;
  domainId: string;
  address: string;
  localPart: string;
  displayName: string;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: string;
  // Only on the create response: the password as set in the mail cluster,
  // which can't be read back afterwards.
  password?: string;
}

export interface AddressAlias {
  address: string;
  destinationMailbox: string;
  destinationMailboxId: string;
  index: string;
}

export interface DomainAlias {
  name: string;
}

export interface CatchAll {
  address?: string;
}

export interface ActivityEntry {
  id: string;
  eventType: string;
  message: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

// The raw key is only present in the create response - the backend stores a
// hash, so it can never be read back.
export interface CreatedApiKey extends ApiKey {
  key: string;
}

/** The API's {"error": "..."} message, or the fallback when there isn't one. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse && typeof err.error?.error === 'string') return err.error.error;
  return fallback;
}

export type BillingInterval = 'monthly' | 'annual';

// Deep-links into a specific Stripe Billing Portal flow instead of its landing page.
export type BillingPortalFlow = 'payment_method_update' | 'subscription_cancel';

export interface Plan {
  id: string;
  name: string;
  priceCentsMonthly?: number;
  priceCentsAnnual?: number;
  maxDomains: number;
  maxMailboxesPerDomain: number;
  purchasable: boolean;
  current: boolean;
}

export interface BillingOverview {
  plan: Plan;
  subscriptionStatus?: string;
  billingInterval?: BillingInterval;
  hasPaymentMethod: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  total: number;
  currency: string;
  createdAt: string;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
}

/**
 * Same-origin /api calls: `ng serve` proxies them to the Go API on :8081
 * (proxy.conf.json), so the session cookie the API set on localhost is sent
 * and no CORS change is needed for this app.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  me() {
    return this.http.get<Customer>('/api/me');
  }

  listDomains() {
    return this.http.get<Domain[]>('/api/domains');
  }

  createDomain(name: string) {
    return this.http.post<Domain>('/api/domains', { name });
  }

  createMailbox(domainId: string, localPart: string) {
    return this.http.post<Mailbox>(`/api/domains/${domainId}/mailboxes`, { localPart });
  }

  domainDns(id: string) {
    return this.http.get<{ records: DnsRecordCheck[] }>(`/api/domains/${id}/dns`);
  }

  listMailboxes(domainId: string) {
    return this.http.get<Mailbox[]>(`/api/domains/${domainId}/mailboxes`);
  }

  listAddressAliases(domainId: string) {
    return this.http.get<AddressAlias[]>(`/api/domains/${domainId}/address-aliases`);
  }

  listDomainAliases(domainId: string) {
    return this.http.get<DomainAlias[]>(`/api/domains/${domainId}/aliases`);
  }

  getCatchAll(domainId: string) {
    return this.http.get<CatchAll>(`/api/domains/${domainId}/catchall`);
  }

  domainActivity(domainId: string) {
    return this.http.get<ActivityEntry[]>(`/api/domains/${domainId}/activity`);
  }

  billingOverview() {
    return this.http.get<BillingOverview>('/api/billing/overview');
  }

  listPlans() {
    return this.http.get<Plan[]>('/api/billing/plans');
  }

  createCheckout(planId: string, interval: BillingInterval) {
    return this.http.post<{ url: string }>('/api/billing/checkout', { planId, interval });
  }

  createPortalSession(flow?: BillingPortalFlow) {
    return this.http.post<{ url: string }>('/api/billing/portal', { flow });
  }

  listInvoices() {
    return this.http.get<Invoice[]>('/api/billing/invoices');
  }

  listApiKeys() {
    return this.http.get<ApiKey[]>('/api/account/api-keys');
  }

  createApiKey(name: string) {
    return this.http.post<CreatedApiKey>('/api/account/api-keys', { name });
  }

  revokeApiKey(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/account/api-keys/${id}`);
  }

  listMembers() {
    return this.http.get<Member[]>('/api/organization/members');
  }

  updateMemberRole(id: string, role: OrganizationRole) {
    return this.http.patch<{ ok: boolean }>(`/api/organization/members/${id}/role`, { role });
  }

  removeMember(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/organization/members/${id}`);
  }

  listInvitations() {
    return this.http.get<Invitation[]>('/api/organization/invitations');
  }

  createInvitation(email: string, role: OrganizationRole) {
    return this.http.post<CreateInvitationResult>('/api/organization/invitations', { email, role });
  }

  revokeInvitation(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/organization/invitations/${id}`);
  }

  listAudit(before?: string) {
    return this.http.get<AuditEntry[]>('/api/organization/audit', { params: before ? { before } : {} });
  }

  logout() {
    return this.http.post<{ ok: boolean }>('/api/logout', {});
  }
}
