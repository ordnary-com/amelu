import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { Domain } from '../api';
import { Domains } from '../domains';
import { DomainHealth } from '../domain-health';
import { Icon, IconName } from '../icon';
import { DOMAIN_STATUS, Tone } from '../status';
import { UI } from '../ui';

const TONE_TEXT: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutral: 'text-muted' };
const TONE_ICON: Record<Tone, IconName> = { ok: 'circleCheck', warn: 'circleAlert', bad: 'circleX', neutral: 'clock' };

/**
 * One domain in the Domains table. A component on the <tr> itself, so the page
 * can put cdkDrag on the row inside its drop list; the handle in here still
 * finds it.
 */
@Component({
  selector: 'tr[ameluDomainRow]',
  imports: [RouterLink, DatePipe, Icon, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (draggable()) {
      <td class="w-0 pl-2">
        <button
          type="button"
          cdkDragHandle
          class="inline-flex size-7 cursor-grab items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink active:cursor-grabbing"
          [attr.aria-label]="'Drag to move ' + domain().name"
          title="Drag to reorder"
        >
          <amelu-icon name="grip" [size]="15" />
        </button>
      </td>
    }
    <td [class]="ui.td + ' max-w-[340px]'">
      <a [routerLink]="'/domains/' + domain().id" class="block truncate font-medium text-link hover:underline">{{ domain().name }}</a>
      <span [class]="ui.tdSub">
        <span class="truncate">{{ domain().id }}</span>
        <button type="button" class="inline-flex flex-none cursor-pointer text-muted hover:text-ink" [attr.aria-label]="'Copy the id of ' + domain().name" [title]="copied() ? 'Copied' : 'Copy id'" (click)="copy()">
          <amelu-icon [name]="copied() ? 'check' : 'copy'" [size]="13" />
        </button>
      </span>
    </td>
    <td [class]="ui.td">
      <span class="inline-flex items-center gap-1.5 whitespace-nowrap" [class]="toneText[status().tone]">
        <amelu-icon [name]="toneIcon[status().tone]" [size]="16" />{{ status().label }}
      </span>
    </td>
    <td [class]="ui.td + ' max-md:hidden'">
      @if (health(); as check) {
        @if (check.total > 0) {
          <span class="flex flex-wrap gap-x-3 gap-y-1">
            @for (key of dnsKeys; track key) {
              <span class="inline-flex items-center gap-1 text-[12px]" [title]="key.toUpperCase() + (check[key] === null ? ' not checked' : check[key] ? ' verified' : ' not verified')">
                <amelu-icon
                  [name]="check[key] === null ? 'dots' : check[key] ? 'check' : 'close'"
                  [size]="12"
                  [class]="check[key] === null ? 'text-muted' : check[key] ? 'text-ok' : 'text-bad'"
                />
                <span [class]="check[key] === false ? 'text-bad' : 'text-muted'">{{ key.toUpperCase() }}</span>
              </span>
            }
          </span>
        } @else {
          <span class="text-muted">Not checked</span>
        }
      } @else if (healthLoading()) {
        <span class="block h-3 w-40 animate-pulse rounded bg-bg"></span>
      } @else {
        <span class="text-muted">Not checked</span>
      }
    </td>
    <td [class]="ui.td + ' whitespace-nowrap max-lg:hidden'">{{ domain().createdAt | date: 'd MMM y' }}</td>
    <td class="w-0 pr-3">
      <button
        type="button"
        class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-bg"
        [class]="domain().favorite ? 'text-warn [&_svg]:fill-current' : 'text-muted/60 hover:text-ink'"
        [attr.aria-label]="(domain().favorite ? 'Remove ' : 'Add ') + domain().name + (domain().favorite ? ' from favorites' : ' to favorites')"
        [attr.aria-pressed]="domain().favorite"
        [title]="domain().favorite ? 'Remove from favorites' : 'Add to favorites'"
        (click)="toggleFavorite()"
      >
        <amelu-icon name="star" [size]="15" />
      </button>
    </td>
  `,
})
export class DomainRow {
  private readonly domains = inject(Domains);
  protected readonly ui = UI;
  protected readonly toneText = TONE_TEXT;
  protected readonly toneIcon = TONE_ICON;
  protected readonly dnsKeys = ['mx', 'spf', 'dkim', 'dmarc'] as const;

  readonly domain = input.required<Domain>();
  readonly health = input<DomainHealth>();
  readonly healthLoading = input(false);
  readonly draggable = input(false);
  /** A favorite that couldn't be saved, as a message for the page. */
  readonly failed = output<string>();

  protected readonly status = computed(() => DOMAIN_STATUS[this.domain().status]);
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.domain().id);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // No clipboard access: nothing to show.
    }
  }

  protected async toggleFavorite(): Promise<void> {
    try {
      await this.domains.setFavorite(this.domain(), !this.domain().favorite);
    } catch (e) {
      this.failed.emit((e as Error).message);
    }
  }
}
