import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Domain } from '../api';
import { ActionIcon } from '../action-icon';
import { DomainHealth } from '../domain-health';
import { DOMAIN_STATUS, badgeClass } from '../status';

/** One domain as a card: name, status, and which DNS records check out. */
@Component({
  selector: 'amelu-domain-card',
  imports: [DatePipe, RouterLink, ActionIcon],
  templateUrl: './domain-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DomainCard {
  readonly domain = input.required<Domain>();
  /** undefined while the DNS check is still running */
  readonly health = input<DomainHealth>();

  protected readonly status = computed(() => DOMAIN_STATUS[this.domain().status]);
  protected readonly badge = computed(() => badgeClass(this.status().tone));
  protected readonly checks = computed(() => {
    const health = this.health();
    if (!health) return null;
    return [
      { label: 'MX', ok: health.mx },
      { label: 'SPF', ok: health.spf },
      { label: 'DKIM', ok: health.dkim },
    ];
  });
}
