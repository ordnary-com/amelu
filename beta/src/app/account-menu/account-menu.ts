import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';
import { Session } from '../session';
import { ORDNARY_ACCOUNT_URL, legacyUrl } from '../config';
import { Theme, ThemeChoice } from '../theme';

/**
 * Top-right account button, modelled on ordnary-console's: organization badge
 * and name, opening a panel with plan, who you're signed in as, and where to
 * manage that.
 */
@Component({
  selector: 'amelu-account-menu',
  imports: [Icon, RouterLink],
  templateUrl: './account-menu.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative flex self-stretch',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
})
export class AccountMenu {
  private readonly session = inject(Session);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly customer = this.session.customer;
  protected readonly open = signal(false);
  protected readonly avatarFailed = signal(false);
  protected readonly ordnaryAccountUrl = ORDNARY_ACCOUNT_URL;
  protected readonly legacyUrl = legacyUrl;
  protected readonly copied = signal(false);
  protected readonly theme = inject(Theme);
  protected readonly themes: { value: ThemeChoice; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ];
  protected readonly link = 'text-[12px] font-medium text-link hover:underline';
  protected readonly item = 'flex w-full py-1.5 text-[14px] hover:underline';

  protected readonly initials = computed(() => {
    const customer = this.customer();
    const source = (customer?.name || customer?.email || '').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  });

  protected readonly showAvatar = computed(() => !!this.customer()?.avatarUrl && !this.avatarFailed());

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  protected copyEmail(): void {
    const email = this.customer()?.email;
    if (!email) return;
    void navigator.clipboard.writeText(email).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  protected logout(): void {
    void this.session.logout();
  }
}
