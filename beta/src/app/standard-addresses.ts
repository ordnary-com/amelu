/**
 * The role addresses email standards expect on every domain (RFC 2142). New
 * domains offer to create them, and they don't count toward the plan's
 * mailbox limit (the API's db.StandardAddresses).
 */
export const STANDARD_ADDRESSES = ['admin', 'postmaster', 'abuse'];

/** How many of these mailboxes count toward the plan limit. */
export function countedMailboxes(list: { localPart: string }[]): number {
  return list.filter((m) => !STANDARD_ADDRESSES.includes(m.localPart.toLowerCase())).length;
}
