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
      class="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-md hover:bg-white/10"
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
      <div class="absolute top-full right-0 z-50 mt-2 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-lg border border-line bg-popover text-ink shadow-xl" role="dialog" aria-label="Notifications">
        <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span class="text-[13px] font-bold">Notifications</span>
          @if (notices.unread().length) {
            <button type="button" class="cursor-pointer text-[12px] text-muted hover:text-ink hover:underline" (click)="notices.markAllRead()">Mark all as read</button>
          }
        </div>
        <ul class="max-h-[60vh] overflow-y-auto">
          @for (n of notices.all(); track n.id) {
            <li class="border-b border-line last:border-b-0" [class.opacity-60]="notices.isRead(n)">
              <a [routerLink]="n.link" class="flex gap-3 px-4 py-3 hover:bg-bg/60" (click)="open.set(false)">
                <span class="mt-1.5 size-2 flex-none rounded-full" [class]="n.tone === 'bad' ? 'bg-bad' : 'bg-warn'"></span>
                <span class="min-w-0">
                  <span class="block text-[13px] font-semibold">{{ n.title }}</span>
                  <span class="block text-[12px] text-muted">{{ n.text }}</span>
                </span>
              </a>
            </li>
          } @empty {
            <li class="px-4 py-8 text-center">
              <amelu-icon name="circleCheck" [size]="22" class="mx-auto text-ok" />
              <p class="mt-2 text-[13px] font-semibold">All good</p>
              <p class="text-[12px] text-muted">Nothing needs your attention right now.</p>
            </li>
          }
        </ul>
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
