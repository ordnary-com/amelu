import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Domains } from '../domains';
import { DomainHealthChecks, needsAttention } from '../domain-health';
import { DomainCard } from '../domain-card/domain-card';
import { Icon } from '../icon';
import { UI } from '../ui';
import { EmptyState } from '../empty-state/empty-state';

/** All domains as cards, with what still needs doing beside them. */
@Component({
  selector: 'amelu-domains-page',
  imports: [EmptyState, RouterLink, DomainCard, Icon],
  templateUrl: './domains-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DomainsPage {
  // undefined while loading, null when the request failed
  protected readonly domains = inject(Domains).list;
  protected readonly health = inject(DomainHealthChecks).byId;
  protected readonly ui = UI;
  protected readonly search = signal('');

  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const list = this.domains() ?? [];
    return query ? list.filter((domain) => domain.name.toLowerCase().includes(query)) : list;
  });

  protected readonly attention = computed(() => {
    const health = this.health();
    return (this.domains() ?? []).filter((domain) => needsAttention(domain, health?.[domain.id]));
  });

  protected readonly summary = computed(() => {
    const list = this.domains();
    if (!list || this.health() === undefined) return null;
    return {
      total: list.length,
      active: list.filter((domain) => domain.status === 'active').length,
      ready: list.length - this.attention().length,
    };
  });

  // Same wording as the current dashboard's Domains page.
  protected readonly headline = computed(() => {
    const summary = this.summary();
    if (!summary) return null;
    const { total } = summary;
    const attention = this.attention().length;
    if (total === 0) return 'Add your first domain';
    if (attention === 0) {
      if (total === 1) return 'Your domain is ready';
      return total === 2 ? 'Both domains are ready' : `All ${total} domains are ready`;
    }
    return `${attention} of ${total} ${total === 1 ? 'domain needs' : 'domains need'} attention`;
  });
}
