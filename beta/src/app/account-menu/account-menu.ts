import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';
import { Session } from '../session';
import { TourState } from '../tour/tour-state';
import { ORDNARY_ACCOUNT_URL } from '../config';
import { Theme } from '../theme';
import { ACCENT_OPTIONS, THEME_OPTIONS, ThemeOption } from '../theme-options';

/**
 * Top-right account button: your picture and name, opening a panel with
 * plan, who you're signed in as, and where to manage that.
 */
@Component({
  selector: 'amelu-account-menu',
  imports: [Icon, RouterLink],
  templateUrl: './account-menu.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative flex',
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
  protected readonly copied = signal(false);
  protected readonly theme = inject(Theme);
  private readonly tour = inject(TourState);
  protected readonly themes = THEME_OPTIONS;
  protected readonly accents = ACCENT_OPTIONS;

  /** A theme's swatch: its sidebar and pane colours split diagonally. */
  protected swatch(option: ThemeOption): string {
    if (option.value === 'system') return 'linear-gradient(135deg,#14191f 50%,#ffffff 50%)';
    const accent = ACCENT_OPTIONS.find((a) => a.value === this.theme.accent())!.color;
    const sidebar = option.sidebar ?? (option.value === 'deep' ? `color-mix(in srgb, ${accent} 32%, #070b14)` : accent);
    return `linear-gradient(135deg,${sidebar} 50%,${option.pane} 50%)`;
  }
  // Rows in the panel: a muted group heading, a label with something on the right, and menu links.
  protected readonly heading = 'px-4 pt-1 pb-0.5 text-[13px] font-medium text-muted';
  protected readonly row = 'flex items-center justify-between gap-3 px-4 py-1.5 text-[14px]';
  protected readonly item = 'flex w-full items-center gap-2.5 px-4 py-2 text-[14px] hover:bg-bg/60 [&>amelu-icon]:flex-none [&>amelu-icon]:text-muted';

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

  protected startTour(): void {
    this.open.set(false);
    this.tour.start();
  }
}
