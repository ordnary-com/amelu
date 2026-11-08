import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import { Domains } from '../domains';
import { ActionIcon, ActionIconName } from '../action-icon';
import { Icon, IconName } from '../icon';

type ActionId =
  | 'domains' | 'mailboxes' | 'activity' | 'account' | 'organization' | 'support'
  | 'new-domain' | 'new-mailbox' | 'dns' | 'invoices' | 'plans' | 'webmail' | 'whats-new' | 'network' | 'status';

interface ActionDef {
  id: ActionId;
  title: string;
  subtitle: string;
  /** The current dashboard's card icon when there is one, else a regular icon. */
  card?: ActionIconName;
  icon?: IconName;
  /** Paths under a domain get the first domain's id; without a domain the action isn't shown. */
  link: string | ((domainId: string) => string);
}

const CATALOG: ActionDef[] = [
  { id: 'domains', title: 'Domains', subtitle: 'Manage your domains', card: 'domains', link: '/domains' },
  { id: 'mailboxes', title: 'Mailboxes', subtitle: 'Manage mailboxes', card: 'mailboxes', link: (d) => `/domains/${d}/mailboxes` },
  { id: 'activity', title: 'Recent Activity', subtitle: 'View all activity', card: 'activity', link: (d) => `/domains/${d}/activity` },
  { id: 'account', title: 'My Account', subtitle: 'Account settings', card: 'account', link: '/account' },
  { id: 'organization', title: 'My Organization', subtitle: 'Organization settings', card: 'organization', link: '/organization' },
  { id: 'support', title: 'Support', subtitle: 'Contact our team', card: 'support', link: '/support' },
  { id: 'new-domain', title: 'Add a domain', subtitle: 'Set up a new domain', icon: 'plus', link: '/domains/new' },
  { id: 'new-mailbox', title: 'New mailbox', subtitle: 'On your first domain', icon: 'mail', link: (d) => `/domains/${d}/mailboxes/new` },
  { id: 'dns', title: 'DNS records', subtitle: 'Check your first domain', icon: 'globe', link: (d) => `/domains/${d}/dns` },
  { id: 'invoices', title: 'Invoices', subtitle: 'Download your invoices', icon: 'receipt', link: '/billing/invoices' },
  { id: 'plans', title: 'Plans', subtitle: 'Change your plan', icon: 'card', link: '/billing/plans' },
  { id: 'webmail', title: 'Webmail branding', subtitle: 'Your name and colour', icon: 'inbox', link: '/organization/webmail' },
  { id: 'whats-new', title: "What's new", subtitle: 'Recent changes', icon: 'map', link: '/changelog' },
  { id: 'network', title: 'Sending IPs', subtitle: 'Where mail goes out from', icon: 'pulse', link: '/network' },
  { id: 'status', title: 'Service status', subtitle: 'Is everything up?', icon: 'circleCheck', link: '/status' },
];

const DEFAULT: ActionId[] = ['domains', 'mailboxes', 'activity', 'account', 'organization', 'support'];
const KEY = 'amelu.quick-actions.v1';

function readOrder(): ActionId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (Array.isArray(saved)) return saved.filter((id): id is ActionId => CATALOG.some((a) => a.id === id));
  } catch {
    // Fall through to the default.
  }
  return [...DEFAULT];
}

/**
 * The row of action cards on Overview. Edit lets you drag them into another
 * order, remove some and add others from the catalog; the choice is
 * remembered per browser.
 */
@Component({
  selector: 'amelu-quick-actions',
  imports: [RouterLink, NgTemplateOutlet, ActionIcon, Icon, CdkDropList, CdkDrag, CdkDragPlaceholder],
  templateUrl: './quick-actions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '(document:keydown.escape)': 'editing.set(false)' },
})
export class QuickActions {
  private readonly domains = inject(Domains).list;

  protected readonly editing = signal(false);
  private readonly order = signal<ActionId[]>(readOrder());

  /** The chosen actions in order; ones that need a domain wait until there is one. */
  protected readonly actions = computed(() => {
    const domainId = this.domains()?.[0]?.id;
    return this.order()
      .map((id) => CATALOG.find((a) => a.id === id)!)
      .filter((a) => typeof a.link === 'string' || domainId)
      .map((a) => ({ ...a, href: typeof a.link === 'string' ? a.link : a.link(domainId!) }));
  });

  protected readonly available = computed(() => CATALOG.filter((a) => !this.order().includes(a.id)));
  protected readonly isDefault = computed(() => this.order().join() === DEFAULT.join());

  protected drop(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    // Indices are of the shown actions; map them back onto the stored order.
    const shown = this.actions().map((a) => a.id);
    const [moved] = shown.splice(event.previousIndex, 1);
    shown.splice(event.currentIndex, 0, moved);
    const waiting = this.order().filter((id) => !shown.includes(id));
    this.save([...shown, ...waiting]);
  }

  protected remove(id: ActionId): void {
    this.save(this.order().filter((a) => a !== id));
  }

  protected add(id: ActionId): void {
    this.save([...this.order(), id]);
  }

  protected reset(): void {
    this.save([...DEFAULT]);
  }

  private save(order: ActionId[]): void {
    this.order.set(order);
    try {
      localStorage.setItem(KEY, JSON.stringify(order));
    } catch {
      // Kept for this visit only.
    }
  }
}
