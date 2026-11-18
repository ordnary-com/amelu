import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, SupportTicket, errorMessage } from '../api';
import { PageHeader } from '../page-header/page-header';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { UI } from '../ui';
import { CATEGORY_LABEL, STATUS } from './support-meta';

const BODY_MAX = 20000;

/** /support/tickets/:id: the conversation, a reply box and closing the ticket. */
@Component({
  selector: 'amelu-support-ticket',
  imports: [PageHeader, Alert, Icon, DatePipe, RouterLink],
  template: `
    @if (ticket(); as t) {
      <amelu-page-header [title]="t.subject" [crumbs]="[{ label: 'Support', link: '/support' }, { label: '#' + t.number }]">
        <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="rounded px-1.5 py-0.5 text-[11px] font-medium" [class]="status[t.status].badge">{{ status[t.status].label }}</span>
          <span>{{ categoryLabel[t.category] }}</span>
          @if (t.domainName) {
            <span>· {{ t.domainName }}</span>
          }
          <span>· opened by {{ t.openedByName }} on {{ t.createdAt | date: 'd MMM y' }}</span>
        </span>
        @if (t.status !== 'closed') {
          <button actions type="button" [class]="ui.outline" [disabled]="busy()" (click)="close()">
            <amelu-icon name="check" [size]="14" />
            Close ticket
          </button>
        }
      </amelu-page-header>

      @if (error(); as message) {
        <amelu-alert class="mb-4 block max-w-3xl">{{ message }}</amelu-alert>
      }

      <ol class="max-w-3xl space-y-3">
        @for (m of t.messages ?? []; track m.id) {
          <li [class]="ui.card + ' p-4'" [class.border-accent]="m.authorKind === 'staff'">
            <div class="flex items-center gap-2">
              <span
                class="flex size-6 flex-none items-center justify-center rounded-full text-[11px] font-bold"
                [class]="m.authorKind === 'staff' ? 'bg-accent text-white' : 'bg-bg text-muted'"
                aria-hidden="true"
              >{{ initial(m.authorName) }}</span>
              <span class="text-[13px] font-medium">{{ m.authorName }}</span>
              @if (m.authorKind === 'staff') {
                <span class="rounded bg-accent/12 px-1.5 py-0.5 text-[11px] font-medium text-link">Staff</span>
              }
              <span class="ml-auto text-[12px] text-muted" [title]="m.createdAt | date: 'medium'">{{ m.createdAt | date: 'd MMM, HH:mm' }}</span>
            </div>
            <div class="mt-2 text-[14px] leading-relaxed break-words whitespace-pre-wrap">{{ m.body }}</div>
          </li>
        }
      </ol>

      <form [class]="ui.card + ' mt-4 max-w-3xl p-4'" (submit)="send($event)">
        <label for="reply" class="sr-only">Reply</label>
        @if (t.status === 'closed') {
          <p class="mb-2 text-[13px] text-muted">This ticket is closed. Replying opens it again.</p>
        }
        <textarea
          id="reply"
          rows="5"
          [class]="ui.input + ' mt-0 h-auto py-2 leading-relaxed'"
          [maxLength]="bodyMax"
          placeholder="Write a reply"
          [value]="reply()"
          (input)="reply.set($any($event.target).value)"
          (keydown.meta.enter)="send($event)"
          (keydown.control.enter)="send($event)"
        ></textarea>
        <div class="mt-3 flex items-center justify-between gap-2">
          <span class="text-[12px] text-muted">We'll email you when support replies.</span>
          <button type="submit" [class]="ui.primary" [disabled]="busy() || !reply().trim()">{{ busy() ? 'Sending…' : 'Send reply' }}</button>
        </div>
      </form>
    } @else if (notFound()) {
      <amelu-page-header title="Ticket not found" [crumbs]="[{ label: 'Support', link: '/support' }]">
        This ticket doesn't exist or belongs to another organization.
      </amelu-page-header>
      <a routerLink="/support" [class]="ui.outline">Back to support</a>
    } @else {
      <div [class]="ui.card + ' h-48 max-w-3xl animate-pulse'"></div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SupportTicketPage {
  private readonly api = inject(Api);
  protected readonly ui = UI;
  protected readonly status = STATUS;
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly bodyMax = BODY_MAX;

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id')!)), { requireSync: true });

  protected readonly ticket = signal<SupportTicket | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reply = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    try {
      this.ticket.set(await firstValueFrom(this.api.getSupportTicket(id)));
      this.notFound.set(false);
    } catch (err) {
      if ((err as { status?: number })?.status === 404) this.notFound.set(true);
      else this.error.set(errorMessage(err, 'Could not load the ticket'));
    }
  }

  protected initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    const t = this.ticket();
    const body = this.reply().trim();
    if (!t || !body || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.replySupportTicket(t.id, body));
      this.reply.set('');
      await this.load(t.id);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not send your reply'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async close(): Promise<void> {
    const t = this.ticket();
    if (!t || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.closeSupportTicket(t.id));
      await this.load(t.id);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not close the ticket'));
    } finally {
      this.busy.set(false);
    }
  }
}
