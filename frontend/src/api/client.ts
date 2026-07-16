export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8081";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type OrganizationRole = "owner" | "admin" | "helpdesk" | "billing" | "read_only";

export interface Customer {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  planTierId: string;
  planTierName: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
  lastSignInAt?: string;
}

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

export interface InvitationDetails {
  valid: boolean;
  email?: string;
  role?: OrganizationRole;
  organizationName?: string;
  existingAccount?: boolean;
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
  status: "provisioning" | "dns_pending" | "active" | "failed" | "suspended";
  dkimSelector?: string;
  lastError?: string;
  createdAt: string;
  verifiedAt?: string;
  notes: string;
  publiclyListed: boolean;
}

export interface ActivityEntry {
  id: string;
  eventType: string;
  message: string;
  createdAt: string;
}

export interface DomainAlias {
  name: string;
}

export interface CatchAll {
  address?: string;
}

export interface AddressAlias {
  address: string;
  destinationMailbox: string;
  destinationMailboxId: string;
  index: string;
}

export interface CreateAddressAliasResult {
  destination: string;
  error?: string;
}

export interface PatternRewrite {
  id: string;
  pattern: string;
  destination: string;
}

export interface BccCapture {
  id: string;
  pattern: string;
  capture: string;
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

export interface SpamSenderLists {
  denylist: string;
  junklist: string;
}

export interface SpamRecipientDenylist {
  denylist: string;
}

export interface EnabledServices {
  maySend: boolean;
  mayReceive: boolean;
  mayImap: boolean;
  mayPop3: boolean;
  maySieve: boolean;
}

export interface InternalAccess {
  internalAccessOnly: boolean;
}

export interface Delegation {
  delegation: string;
}

export interface MailboxForward {
  id: string;
  destination: string;
}

export interface MailboxListing {
  name: string;
  tags: string;
}

export interface MailboxNotes {
  notes: string;
}

export interface Identity {
  id: string;
  name: string;
  email: string;
}

export interface RecentEmail {
  id: string;
  subject: string;
  from: string[];
  to: string[];
  receivedAt: string;
}

export interface RecentLogs {
  incoming: RecentEmail[];
  outgoing: RecentEmail[];
}

export interface MailboxExpiration {
  expiresAt: string | null;
  removeUponExpiration: boolean;
}

export interface MailboxLimits {
  maxEmails: number;
  maxDiskQuotaBytes: number;
}

export interface Mailbox {
  id: string;
  domainId: string;
  address: string;
  localPart: string;
  displayName: string;
  status: "active" | "suspended" | "deleted";
  createdAt: string;
  generatedPassword?: string;
}

export interface ImportMailboxResult {
  address: string;
  generatedPassword?: string;
  note?: string;
  error?: string;
}

export interface ImportAliasResult {
  alias: string;
  destination: string;
  error?: string;
}

export interface DnsRecordCheck {
  type: string;
  name: string;
  expected: string;
  actual?: string[];
  status: "matched" | "mismatch" | "missing" | "unchecked";
}

export interface DomainConnectStatus {
  supported: boolean;
  applyUrl?: string;
}

export type BillingInterval = "monthly" | "annual";

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

// Deep-links into a specific Stripe Billing Portal flow instead of its
// default landing page - see
// https://stripe.com/docs/customer-management/portal-deep-links.
export type BillingPortalFlow = "payment_method_update" | "subscription_cancel";

export interface Invoice {
  id: string;
  number: string;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  total: number;
  currency: string;
  createdAt: string;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
}


export const api = {
  signup: (
    email: string,
    password: string,
    organizationName: string,
    firstName: string,
    lastName: string,
    username: string,
  ) =>
    request<Customer>("/api/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, organizationName, firstName, lastName, username }),
    }),

  login: (email: string, password: string) =>
    request<Customer>("/api/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),

  me: () => request<Customer>("/api/me"),

  updateAccountName: (name: string) =>
    request<Customer>("/api/account/name", { method: "PATCH", body: JSON.stringify({ name }) }),

  updateAccountProfile: (firstName: string, lastName: string, username: string) =>
    request<Customer>("/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ firstName, lastName, username }),
    }),

  updateAccountEmail: (email: string, currentPassword: string) =>
    request<Customer>("/api/account/email", {
      method: "PATCH",
      body: JSON.stringify({ email, currentPassword }),
    }),

  updateAccountPassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/api/account/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  terminateAccount: (currentPassword: string) =>
    request<{ ok: boolean }>("/api/account", {
      method: "DELETE",
      body: JSON.stringify({ currentPassword }),
    }),

  listDomains: () => request<Domain[]>("/api/domains"),

  createDomain: (name: string) =>
    request<Domain>("/api/domains", { method: "POST", body: JSON.stringify({ name }) }),

  deleteDomain: (id: string) => request<{ ok: boolean }>(`/api/domains/${id}`, { method: "DELETE" }),

  getDomainDns: (id: string) => request<{ records: DnsRecordCheck[] }>(`/api/domains/${id}/dns`),

  getDomainConnect: (id: string) => request<DomainConnectStatus>(`/api/domains/${id}/domain-connect`),

  listMailboxes: (domainId: string) => request<Mailbox[]>(`/api/domains/${domainId}/mailboxes`),

  createMailbox: (domainId: string, localPart: string, displayName?: string, password?: string) =>
    request<Mailbox>(`/api/domains/${domainId}/mailboxes`, {
      method: "POST",
      body: JSON.stringify({ localPart, displayName, password }),
    }),

  getMailbox: (id: string) => request<Mailbox>(`/api/mailboxes/${id}`),

  updateMailboxName: (id: string, displayName: string) =>
    request<Mailbox>(`/api/mailboxes/${id}/name`, { method: "PATCH", body: JSON.stringify({ displayName }) }),

  deleteMailbox: (id: string) => request<{ ok: boolean }>(`/api/mailboxes/${id}`, { method: "DELETE" }),

  suspendMailbox: (id: string) => request<Mailbox>(`/api/mailboxes/${id}/suspend`, { method: "POST" }),

  activateMailbox: (id: string) => request<Mailbox>(`/api/mailboxes/${id}/activate`, { method: "POST" }),

  importMailboxesCSV: (domainId: string, csv: string) =>
    request<{ results: ImportMailboxResult[] }>(`/api/domains/${domainId}/mailboxes/import`, {
      method: "POST",
      body: JSON.stringify({ csv }),
    }),

  importAddressAliasesCSV: (domainId: string, csv: string) =>
    request<{ results: ImportAliasResult[] }>(`/api/domains/${domainId}/address-aliases/import`, {
      method: "POST",
      body: JSON.stringify({ csv }),
    }),

  getActivity: (domainId: string) => request<ActivityEntry[]>(`/api/domains/${domainId}/activity`),

  updateDomainNotes: (domainId: string, notes: string) =>
    request<{ notes: string }>(`/api/domains/${domainId}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    }),

  updateDomainListing: (domainId: string, publiclyListed: boolean) =>
    request<{ publiclyListed: boolean }>(`/api/domains/${domainId}/listing`, {
      method: "PATCH",
      body: JSON.stringify({ publiclyListed }),
    }),

  transferDomain: (domainId: string, newOwnerEmail: string) =>
    request<{ ok: boolean }>(`/api/domains/${domainId}/transfer`, {
      method: "POST",
      body: JSON.stringify({ newOwnerEmail }),
    }),

  deactivateDomain: (domainId: string) =>
    request<{ ok: boolean }>(`/api/domains/${domainId}/deactivate`, { method: "POST" }),

  reactivateDomain: (domainId: string) =>
    request<{ ok: boolean }>(`/api/domains/${domainId}/reactivate`, { method: "POST" }),

  listDomainAliases: (domainId: string) => request<DomainAlias[]>(`/api/domains/${domainId}/aliases`),

  createDomainAlias: (domainId: string, name: string) =>
    request<DomainAlias>(`/api/domains/${domainId}/aliases`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  deleteDomainAlias: (domainId: string, name: string) =>
    request<{ ok: boolean }>(`/api/domains/${domainId}/aliases/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),

  getCatchAll: (domainId: string) => request<CatchAll>(`/api/domains/${domainId}/catchall`),

  updateCatchAll: (domainId: string, address: string) =>
    request<CatchAll>(`/api/domains/${domainId}/catchall`, {
      method: "PUT",
      body: JSON.stringify({ address }),
    }),

  listAddressAliases: (domainId: string) => request<AddressAlias[]>(`/api/domains/${domainId}/address-aliases`),

  createAddressAlias: (domainId: string, localPart: string, destination: string) =>
    request<{ results: CreateAddressAliasResult[] }>(`/api/domains/${domainId}/address-aliases`, {
      method: "POST",
      body: JSON.stringify({ localPart, destinations: [destination] }),
    }),

  deleteAddressAlias: (mailboxId: string, index: string) =>
    request<{ ok: boolean }>(`/api/mailboxes/${mailboxId}/address-aliases/${index}`, {
      method: "DELETE",
    }),

  listPatternRewrites: (domainId: string) => request<PatternRewrite[]>(`/api/domains/${domainId}/rewrites`),

  createPatternRewrite: (domainId: string, pattern: string, destination: string) =>
    request<PatternRewrite>(`/api/domains/${domainId}/rewrites`, {
      method: "POST",
      body: JSON.stringify({ pattern, destination }),
    }),

  deletePatternRewrite: (domainId: string, ruleId: string) =>
    request<{ ok: boolean }>(`/api/domains/${domainId}/rewrites/${ruleId}`, { method: "DELETE" }),

  listBccCaptures: (domainId: string) => request<BccCapture[]>(`/api/domains/${domainId}/bccs`),

  createBccCapture: (domainId: string, pattern: string, capture: string) =>
    request<BccCapture>(`/api/domains/${domainId}/bccs`, {
      method: "POST",
      body: JSON.stringify({ pattern, capture }),
    }),

  deleteBccCapture: (domainId: string, ruleId: string) =>
    request<{ ok: boolean }>(`/api/domains/${domainId}/bccs/${ruleId}`, { method: "DELETE" }),

  getSpamOverview: (domainId: string) => request<SpamOverview>(`/api/domains/${domainId}/spam/overview`),

  getSpamSubjectSettings: (domainId: string) =>
    request<SpamSubjectSettings>(`/api/domains/${domainId}/spam/subject-settings`),

  updateSpamSubjectSettings: (domainId: string, settings: SpamSubjectSettings) =>
    request<SpamSubjectSettings>(`/api/domains/${domainId}/spam/subject-settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  getSpamSenderLists: (domainId: string) => request<SpamSenderLists>(`/api/domains/${domainId}/spam/sender-lists`),

  updateSpamSenderLists: (domainId: string, lists: SpamSenderLists) =>
    request<SpamSenderLists>(`/api/domains/${domainId}/spam/sender-lists`, {
      method: "PUT",
      body: JSON.stringify(lists),
    }),

  getSpamRecipientDenylist: (domainId: string) =>
    request<SpamRecipientDenylist>(`/api/domains/${domainId}/spam/recipient-denylist`),

  updateSpamRecipientDenylist: (domainId: string, denylist: SpamRecipientDenylist) =>
    request<SpamRecipientDenylist>(`/api/domains/${domainId}/spam/recipient-denylist`, {
      method: "PUT",
      body: JSON.stringify(denylist),
    }),

  getMailboxActivity: (mailboxId: string) => request<ActivityEntry[]>(`/api/mailboxes/${mailboxId}/activity`),

  getMailboxLogs: (mailboxId: string) => request<RecentLogs>(`/api/mailboxes/${mailboxId}/logs`),

  getMailboxServices: (mailboxId: string) => request<EnabledServices>(`/api/mailboxes/${mailboxId}/services`),

  updateMailboxServices: (mailboxId: string, services: EnabledServices) =>
    request<EnabledServices>(`/api/mailboxes/${mailboxId}/services`, {
      method: "PUT",
      body: JSON.stringify(services),
    }),

  setMailboxPassword: (mailboxId: string, password: string) =>
    request<{ ok: boolean }>(`/api/mailboxes/${mailboxId}/password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  inviteMailboxPassword: (mailboxId: string, email: string) =>
    request<{ ok: boolean }>(`/api/mailboxes/${mailboxId}/password/invite`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  getPasswordResetToken: (token: string) =>
    request<{ valid: boolean; address?: string }>(`/api/password-reset/${token}`),

  completePasswordReset: (token: string, password: string) =>
    request<{ ok: boolean }>(`/api/password-reset/${token}`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  getMailboxInternalAccess: (mailboxId: string) =>
    request<InternalAccess>(`/api/mailboxes/${mailboxId}/internal-access`),

  updateMailboxInternalAccess: (mailboxId: string, internalAccessOnly: boolean) =>
    request<InternalAccess>(`/api/mailboxes/${mailboxId}/internal-access`, {
      method: "PUT",
      body: JSON.stringify({ internalAccessOnly }),
    }),

  getMailboxDelegation: (mailboxId: string) => request<Delegation>(`/api/mailboxes/${mailboxId}/delegation`),

  updateMailboxDelegation: (mailboxId: string, delegation: string) =>
    request<Delegation>(`/api/mailboxes/${mailboxId}/delegation`, {
      method: "PUT",
      body: JSON.stringify({ delegation }),
    }),

  listMailboxForwards: (mailboxId: string) => request<MailboxForward[]>(`/api/mailboxes/${mailboxId}/forwards`),

  createMailboxForward: (mailboxId: string, destination: string) =>
    request<MailboxForward>(`/api/mailboxes/${mailboxId}/forwards`, {
      method: "POST",
      body: JSON.stringify({ destination }),
    }),

  deleteMailboxForward: (mailboxId: string, forwardId: string) =>
    request<{ ok: boolean }>(`/api/mailboxes/${mailboxId}/forwards/${forwardId}`, { method: "DELETE" }),

  getMailboxListing: (mailboxId: string) => request<MailboxListing>(`/api/mailboxes/${mailboxId}/listing`),

  updateMailboxListing: (mailboxId: string, listing: MailboxListing) =>
    request<MailboxListing>(`/api/mailboxes/${mailboxId}/listing`, {
      method: "PUT",
      body: JSON.stringify(listing),
    }),

  getMailboxNotes: (mailboxId: string) => request<MailboxNotes>(`/api/mailboxes/${mailboxId}/notes`),

  updateMailboxNotes: (mailboxId: string, notes: string) =>
    request<MailboxNotes>(`/api/mailboxes/${mailboxId}/notes`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    }),

  listMailboxIdentities: (mailboxId: string) => request<Identity[]>(`/api/mailboxes/${mailboxId}/identities`),

  createMailboxIdentity: (mailboxId: string, name: string, email: string) =>
    request<Identity>(`/api/mailboxes/${mailboxId}/identities`, {
      method: "POST",
      body: JSON.stringify({ name, email }),
    }),

  deleteMailboxIdentity: (mailboxId: string, identityId: string) =>
    request<{ ok: boolean }>(`/api/mailboxes/${mailboxId}/identities/${identityId}`, { method: "DELETE" }),

  getMailboxExpiration: (mailboxId: string) => request<MailboxExpiration>(`/api/mailboxes/${mailboxId}/expiration`),

  updateMailboxExpiration: (mailboxId: string, expiration: MailboxExpiration) =>
    request<MailboxExpiration>(`/api/mailboxes/${mailboxId}/expiration`, {
      method: "PUT",
      body: JSON.stringify(expiration),
    }),

  getMailboxLimits: (mailboxId: string) => request<MailboxLimits>(`/api/mailboxes/${mailboxId}/limits`),

  updateMailboxLimits: (mailboxId: string, limits: MailboxLimits) =>
    request<MailboxLimits>(`/api/mailboxes/${mailboxId}/limits`, {
      method: "PUT",
      body: JSON.stringify(limits),
    }),

  getDomainDefaultServices: (domainId: string) =>
    request<EnabledServices>(`/api/domains/${domainId}/mailboxes/default-services`),

  updateDomainDefaultServices: (domainId: string, services: EnabledServices) =>
    request<EnabledServices>(`/api/domains/${domainId}/mailboxes/default-services`, {
      method: "PUT",
      body: JSON.stringify(services),
    }),

  getDomainDefaultLimits: (domainId: string) =>
    request<MailboxLimits>(`/api/domains/${domainId}/mailboxes/default-limits`),

  updateDomainDefaultLimits: (domainId: string, limits: MailboxLimits) =>
    request<MailboxLimits>(`/api/domains/${domainId}/mailboxes/default-limits`, {
      method: "PUT",
      body: JSON.stringify(limits),
    }),

  getBillingOverview: () => request<BillingOverview>("/api/billing/overview"),

  listPlans: () => request<Plan[]>("/api/billing/plans"),

  createCheckoutSession: (planId: string, interval: BillingInterval = "annual") =>
    request<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ planId, interval }) }),

  createBillingPortalSession: (flow?: BillingPortalFlow) =>
    request<{ url: string }>("/api/billing/portal", { method: "POST", body: JSON.stringify({ flow }) }),

  listInvoices: () => request<Invoice[]>("/api/billing/invoices"),

  listOrganizationMembers: () => request<Member[]>("/api/organization/members"),

  updateMemberRole: (id: string, role: OrganizationRole) =>
    request<{ ok: boolean }>(`/api/organization/members/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  removeMember: (id: string) =>
    request<{ ok: boolean }>(`/api/organization/members/${id}`, { method: "DELETE" }),

  listOrganizationInvitations: () => request<Invitation[]>("/api/organization/invitations"),

  createInvitation: (email: string, role: OrganizationRole) =>
    request<CreateInvitationResult>("/api/organization/invitations", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),

  revokeInvitation: (id: string) =>
    request<{ ok: boolean }>(`/api/organization/invitations/${id}`, { method: "DELETE" }),

  listOrganizationAudit: (before?: string) =>
    request<AuditEntry[]>(`/api/organization/audit${before ? `?before=${encodeURIComponent(before)}` : ""}`),

  getInvitation: (token: string) => request<InvitationDetails>(`/api/invitations/${token}`),

  acceptInvitation: (
    token: string,
    password: string,
    firstName: string,
    lastName: string,
    username: string,
  ) =>
    request<Customer>(`/api/invitations/${token}/accept`, {
      method: "POST",
      body: JSON.stringify({ password, firstName, lastName, username }),
    }),
};
