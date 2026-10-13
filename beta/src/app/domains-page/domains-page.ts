import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Domain } from '../api';
import { RouterLink } from '@angular/router';
import { Domains } from '../domains';
import { DomainHealthChecks, needsAttention } from '../domain-health';
import { DomainCard } from '../domain-card/domain-card';
import { Icon } from '../icon';
import { UI } from '../ui';
import { EmptyState } from '../empty-state/empty-state';
import { Alert } from '../alert/alert';

export type DomainSort = 'custom' | 'name' | 'name-desc' | 'newest' | 'oldest' | 'status';

export const DOMAIN_SORTS: { value: DomainSort; label: string }[] = [
  { value: 'custom', label: 'Your order' },
  { value: 'name', label: 'Name, A to Z' },
  { value: 'name-desc', label: 'Name, Z to A' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'status', label: 'Status' },
];

const SORT_KEY = 'amelu.domain-sort';

// Needs attention first, then the ones still being set up, then the rest.
const STATUS_RANK: Record<Domain['status'], number> = {
  failed: 0,
  suspended: 1,
  dns_pending: 2,
  provisioning: 3,
  active: 4,
};

const SORTERS: Record<Exclude<DomainSort, 'custom'>, (a: Domain, b: Domain) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  newest: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  oldest: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name),
};

/** All domains as cards, with what still needs doing beside them. */
@Component({
  selector: 'amelu-domains-page',
  imports: [EmptyState, RouterLink, DomainCard, Icon, Alert, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
  templateUrl: './domains-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DomainsPage {
  private readonly store = inject(Domains);
  // undefined while loading, null when the request failed
  protected readonly domains = this.store.arranged;
  protected readonly health = inject(DomainHealthChecks).byId;
  protected readonly ui = UI;
  protected readonly search = signal('');
  protected readonly sorts = DOMAIN_SORTS;
  protected readonly sort = signal<DomainSort>(readSort());
  protected readonly error = signal<string | null>(null);

  /** Dragging only makes sense in your own order, over the whole list. */
  protected readonly canDrag = computed(() => this.sort() === 'custom' && !this.search().trim());

  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const list = this.domains() ?? [];
    const matches = query ? list.filter((domain) => domain.name.toLowerCase().includes(query)) : list;
    const sort = this.sort();
    // The store already arranges favorites first, then your order.
    return sort === 'custom' ? matches : [...matches].sort(SORTERS[sort]);
  });

  protected readonly favorites = computed(() => this.filtered().filter((domain) => domain.favorite));
  protected readonly others = computed(() => this.filtered().filter((domain) => !domain.favorite));

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(SORT_KEY, this.sort());
      } catch {
        // Storage blocked; the choice just won't be remembered.
      }
    });
  }

  // Favorites and the rest are separate lists; a drop reorders within one
  // and saves both, favorites first, as the full order.
  protected async drop(group: 'favorites' | 'others', event: CdkDragDrop<Domain[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const favorites = [...this.favorites()];
    const others = [...this.others()];
    moveItemInArray(group === 'favorites' ? favorites : others, event.previousIndex, event.currentIndex);
    this.error.set(null);
    try {
      await this.store.setOrder([...favorites, ...others].map((domain) => domain.id));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

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

function readSort(): DomainSort {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    if (DOMAIN_SORTS.some((sort) => sort.value === saved)) return saved as DomainSort;
  } catch {
    // Storage blocked; start from the default.
  }
  return 'custom';
}
