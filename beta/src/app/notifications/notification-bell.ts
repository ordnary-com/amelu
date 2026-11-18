import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';
import { Notifications } from './notifications';

/** The bell in the top bar: a count of what needs attention, and the list. */
@Component({
  selector: 'amelu-notification-bell',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative flex items-center',
    '(document:click)': 'outside($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    <button
      type="button"
      class="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink aria-expanded:bg-accent/10 aria-expanded:text-link"
      [attr.aria-label]="'Notifications' + (notices.unread().length ? ', ' + notices.unread().length + ' unread' : '')"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <amelu-icon name="bell" [size]="19" />
      @if (notices.unread().length; as n) {
        <span class="absolute top-1 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] leading-4 font-bold text-white">{{ n > 9 ? '9+' : n }}</span>
      }
    </button>
    @if (open()) {
      <div class="absolute top-full right-0 z-50 mt-1.5 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-md border border-line bg-popover text-ink shadow-md" role="dialog" aria-label="Notifications">
        <div class="flex items-center justify-between gap-3 px-4 pt-3 pb-1">
          <span class="text-[14px] font-medium text-muted">Amelu Notifications</span>
          @if (notices.unread().length) {
            <button type="button" class="cursor-pointer text-[12px] text-link hover:underline" (click)="notices.markAllRead()">Mark all as read</button>
          }
        </div>
        <ul class="max-h-[60vh] overflow-y-auto py-1">
          @for (n of notices.all(); track n.id) {
            <li>
              <a [routerLink]="n.link" class="flex items-start gap-2.5 px-4 py-2 hover:bg-bg/60" (click)="open.set(false)">
                <amelu-icon name="circleAlert" [size]="18" class="flex-none" [class]="n.tone === 'bad' ? 'text-bad' : 'text-warn'" />
                <span class="min-w-0 flex-1">
                  <span class="block text-[14px]" [class]="notices.isRead(n) ? 'text-muted' : 'font-medium'">{{ n.title }}</span>
                  <span class="mt-0.5 block text-[12px] text-muted">{{ n.text }}</span>
                </span>
                @if (!notices.isRead(n)) {
                  <span class="mt-1.5 size-2 flex-none rounded-full bg-accent"><span class="sr-only">Unread</span></span>
                }
              </a>
            </li>
          } @empty {
            <li class="flex items-center gap-2.5 px-4 py-2 text-[14px]">
              <amelu-icon name="circleCheck" [size]="18" class="flex-none" />
              No notifications
            </li>
          }
        </ul>
        <div class="mt-1 h-3 border-t border-line" aria-hidden="true"></div>
      </div>
    }
  `,
})
export class NotificationBell {
  protected readonly notices = inject(Notifications);
  protected readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected outside(event: Event): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.open.set(false);
  }
}
