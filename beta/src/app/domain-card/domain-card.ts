import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Domain } from '../api';
import { ActionIcon } from '../action-icon';
import { Icon } from '../icon';
import { DomainHealth, healthScore } from '../domain-health';
import { Domains } from '../domains';
import { DOMAIN_STATUS, badgeClass } from '../status';

/**
 * One domain as a card: name, status, which DNS records check out, and a star.
 * Extra buttons next to the star go in with the cardAction attribute.
 */
@Component({
  selector: 'amelu-domain-card',
  imports: [DatePipe, RouterLink, ActionIcon, Icon],
  templateUrl: './domain-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DomainCard {
  readonly domain = input.required<Domain>();
  /** undefined while the DNS check is still running */
  readonly health = input<DomainHealth>();

  private readonly domains = inject(Domains);
  protected readonly favoriteFailed = signal(false);

  protected readonly status = computed(() => DOMAIN_STATUS[this.domain().status]);
  protected readonly badge = computed(() => badgeClass(this.status().tone));
  protected readonly checks = computed(() => {
    const health = this.health();
    if (!health) return null;
    return [
      { label: 'MX', ok: health.mx },
      { label: 'SPF', ok: health.spf },
      { label: 'DKIM', ok: health.dkim },
      { label: 'DMARC', ok: health.dmarc },
    ];
  });

  protected readonly score = computed(() => healthScore(this.health()));
  // The ring is drawn as a dash of a circle with r=14 (circumference ~88).
  protected readonly dash = computed(() => `${((this.score() ?? 0) / 100) * 87.96} 87.96`);
  protected readonly scoreTone = computed(() => {
    const score = this.score();
    return score === null ? 'text-muted' : score === 100 ? 'text-ok' : score >= 60 ? 'text-warn' : 'text-bad';
  });

  // Handled here rather than by the page, so the star works wherever the
  // card is shown (the Domains page and the home page).
  protected async toggleFavorite(): Promise<void> {
    this.favoriteFailed.set(false);
    try {
      await this.domains.setFavorite(this.domain(), !this.domain().favorite);
    } catch {
      this.favoriteFailed.set(true);
    }
  }
}
