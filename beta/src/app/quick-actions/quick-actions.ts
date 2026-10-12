import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Domains } from '../domains';
import { ActionIcon, ActionIconName } from '../action-icon';

interface QuickAction {
  icon: ActionIconName;
  title: string;
  subtitle: string;
  link: string;
}

/** The current dashboard's row of action cards, in the console card style. */
@Component({
  selector: 'amelu-quick-actions',
  imports: [RouterLink, ActionIcon],
  templateUrl: './quick-actions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class QuickActions {
  private readonly domains = inject(Domains).list;

  // Mailboxes and activity live under a domain, so they need one to exist.
  protected readonly actions = computed<QuickAction[]>(() => {
    const firstDomain = this.domains()?.[0];
    return [
      { icon: 'domains', title: 'Email Domains', subtitle: 'Manage your domains', link: '/domains' },
      ...(firstDomain
        ? [
            { icon: 'mailboxes', title: 'Mailboxes', subtitle: 'Manage mailboxes', link: `/domains/${firstDomain.id}/mailboxes` },
            { icon: 'activity', title: 'Recent Activity', subtitle: 'View all activity', link: `/domains/${firstDomain.id}/activity` },
          ] satisfies QuickAction[]
        : []),
      { icon: 'account', title: 'My Account', subtitle: 'Account settings', link: '/account' },
      { icon: 'organization', title: 'My Organization', subtitle: 'Organization settings', link: '/organization' },
      { icon: 'support', title: 'Support', subtitle: 'Contact our team', link: '/support' },
    ];
  });
}
