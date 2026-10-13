import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, Invitation, Member, OrganizationRole, errorMessage } from '../api';
import { Session } from '../session';
import { Alert } from '../alert/alert';
import { ROLE, badgeClass } from '../status';
import { UI } from '../ui';
import { EmptyState } from '../empty-state/empty-state';
import { Avatar } from '../avatar';

const ASSIGNABLE_ROLES: OrganizationRole[] = ['owner', 'admin', 'helpdesk', 'billing', 'read_only'];

/** The current dashboard's /organization: details, team members and invitations. */
@Component({
  selector: 'amelu-organization-page',
  imports: [EmptyState, DatePipe, RouterLink, Alert, Avatar],
  templateUrl: './organization-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:keydown.escape)': 'closeRemove()',
  },
})
export class OrganizationPage {
  private readonly api = inject(Api);
  protected readonly customer = inject(Session).customer;
  protected readonly ui = UI;
  protected readonly roles = ROLE;
  protected readonly assignableRoles = ASSIGNABLE_ROLES;
  protected readonly badge = badgeClass;

  protected readonly canManage = computed(() => {
    const role = this.customer()?.role;
    return role === 'owner' || role === 'admin';
  });
  protected readonly isOwner = computed(() => this.customer()?.role === 'owner');

  // undefined while loading
  protected readonly members = signal<Member[] | undefined>(undefined);
  protected readonly invitations = signal<Invitation[] | undefined>(undefined);
  protected readonly error = signal<string | null>(null);

  protected readonly inviteEmail = signal('');
  protected readonly inviteRole = signal<OrganizationRole>('read_only');
  protected readonly inviting = signal(false);
  protected readonly inviteSuccess = signal<string | null>(null);
  protected readonly devInviteUrl = signal<string | null>(null);

  protected readonly removeTarget = signal<Member | null>(null);
  protected readonly removing = signal(false);

  constructor() {
    void this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const [members, invitations] = await Promise.all([
        firstValueFrom(this.api.listMembers()),
        this.canManage() ? firstValueFrom(this.api.listInvitations()) : Promise.resolve([]),
      ]);
      this.members.set(members);
      this.invitations.set(invitations);
    } catch (err) {
      this.members.set(this.members() ?? []);
      this.invitations.set(this.invitations() ?? []);
      this.error.set(errorMessage(err, 'Could not load organization'));
    }
  }

  protected async changeRole(member: Member, role: OrganizationRole): Promise<void> {
    this.error.set(null);
    try {
      await firstValueFrom(this.api.updateMemberRole(member.id, role));
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not update role'));
      await this.reload();
    }
  }

  protected closeRemove(): void {
    if (!this.removing()) this.removeTarget.set(null);
  }

  protected async confirmRemove(): Promise<void> {
    const target = this.removeTarget();
    if (!target) return;
    this.removing.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.removeMember(target.id));
      this.removeTarget.set(null);
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not remove member'));
    } finally {
      this.removing.set(false);
    }
  }

  protected async sendInvite(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.inviteSuccess.set(null);
    this.devInviteUrl.set(null);
    this.inviting.set(true);
    try {
      const result = await firstValueFrom(this.api.createInvitation(this.inviteEmail().trim(), this.inviteRole()));
      this.inviteSuccess.set(
        result.emailSent
          ? `Invitation sent to ${result.email}.`
          : `Invitation created for ${result.email}, but email delivery isn't configured on this server.`,
      );
      this.devInviteUrl.set(result.devInviteUrl ?? null);
      this.inviteEmail.set('');
      this.inviteRole.set('read_only');
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not send invitation'));
    } finally {
      this.inviting.set(false);
    }
  }

  protected async revoke(invitation: Invitation): Promise<void> {
    this.error.set(null);
    try {
      await firstValueFrom(this.api.revokeInvitation(invitation.id));
      await this.reload();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not revoke invitation'));
    }
  }
}
