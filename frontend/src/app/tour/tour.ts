import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Session } from '../session';
import { Domains } from '../domains';
import { UI } from '../ui';
import { TourState } from './tour-state';

interface Step {
  /** Page to open first. */
  route: string;
  /** data-tour value of the element the tooltip points at. */
  target: string;
  title: string;
  body: string;
}

type Side = 'right' | 'left' | 'bottom';

interface Placed {
  ring: { top: number; left: number; width: number; height: number };
  card: { top: number; left: number };
  arrow: { top: number; left: number };
  side: Side;
}

const WIDTH = 300;
const GAP = 14;
const RING = 4;

/** The steps depend on whether onboarding already added a domain. */
function stepsFor(domain: { id: string; name: string } | null): Step[] {
  const domainSteps: Step[] = domain
    ? [
        {
          route: '/',
          target: 'domains',
          title: 'Your domains',
          body: `${domain.name} is added. Let's walk through its settings.`,
        },
        {
          route: `/domains/${domain.id}`,
          target: 'domain-dns',
          title: 'DNS status',
          body: 'These records decide whether mail arrives. Green means verified; anything red needs a change at your DNS provider.',
        },
        {
          route: `/domains/${domain.id}`,
          target: 'menu:Mailboxes',
          title: 'Mailboxes',
          body: 'Create an inbox for each person or team, with its own password and storage.',
        },
        {
          route: `/domains/${domain.id}`,
          target: 'menu:Address Aliases',
          title: 'Aliases',
          body: 'Extra addresses that deliver into an existing mailbox, like info@ or sales@.',
        },
        {
          route: `/domains/${domain.id}`,
          target: 'menu:DNS Configuration',
          title: 'DNS configuration',
          body: 'Every record this domain needs, ready to copy. Most DNS providers can be fixed in one click.',
        },
        {
          route: `/domains/${domain.id}`,
          target: 'menu:Spam Filtering',
          title: 'Spam filtering',
          body: 'Tune how strict filtering is and keep your own allow and block lists.',
        },
      ]
    : [
        {
          route: '/',
          target: 'add-domain',
          title: 'Add your domain',
          body: 'Start here. We check your DNS as you go and show exactly which records to add.',
        },
      ];

  return [
    ...domainSteps,
    {
      route: '/',
      target: 'organization',
      title: 'Your organization',
      body: 'Invite teammates, see recent changes in the activity log and set up webmail with your branding.',
    },
    {
      route: '/',
      target: 'billing',
      title: 'Billing',
      body: 'Change your plan, update payment details and download invoices.',
    },
    {
      route: '/',
      target: 'account',
      title: 'Your account',
      body: 'Appearance, API keys and your Ordnary account. You can take this tour again from here.',
    },
  ];
}

/** Tooltip tour through the dashboard, shown once after onboarding. */
@Component({
  selector: 'amelu-tour',
  template: `
    @if (state.active() && placed(); as p) {
      <!-- A ring around the item; the page itself stays usable. -->
      <div
        class="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-accent transition-all duration-200 motion-reduce:transition-none"
        [style.top.px]="p.ring.top"
        [style.left.px]="p.ring.left"
        [style.width.px]="p.ring.width"
        [style.height.px]="p.ring.height"
      ></div>

      <div
        class="fixed z-[61] rounded-lg border border-line bg-surface p-3.5 text-ink shadow-lg transition-all duration-200 motion-reduce:transition-none"
        role="dialog"
        [attr.aria-label]="step().title"
        [style.width.px]="width"
        [style.top.px]="p.card.top"
        [style.left.px]="p.card.left"
      >
        <!-- Arrow pointing at the item -->
        <span
          class="absolute size-3 rotate-45 border-line bg-surface"
          [class]="arrowClass[p.side]"
          [style.top.px]="p.arrow.top"
          [style.left.px]="p.arrow.left"
          aria-hidden="true"
        ></span>

        <div class="relative flex items-start justify-between gap-3">
          <h2 class="text-[14px] font-bold">{{ step().title }}</h2>
          <span class="flex-none pt-0.5 text-[11px] text-muted tabular-nums">{{ index() + 1 }}/{{ steps().length }}</span>
        </div>
        <p class="relative mt-1 text-[13px] leading-relaxed text-muted">{{ step().body }}</p>
        <div class="relative mt-3 flex items-center justify-between gap-2">
          <button type="button" class="cursor-pointer text-[12px] text-muted hover:text-ink" (click)="close()">
            {{ last() ? 'Close' : 'Skip tour' }}
          </button>
          <div class="flex gap-1.5">
            @if (index() > 0) {
              <button type="button" [class]="ui.outline + ' h-7 px-2.5 text-[12px]'" (click)="go(-1)">Back</button>
            }
            <button type="button" [class]="ui.primary + ' h-7 px-2.5 text-[12px]'" (click)="last() ? close() : go(1)">
              {{ last() ? 'Done' : 'Next' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Tour {
  protected readonly state = inject(TourState);
  private readonly session = inject(Session);
  private readonly domains = inject(Domains);
  private readonly router = inject(Router);
  protected readonly ui = UI;
  protected readonly width = WIDTH;
  protected readonly arrowClass: Record<Side, string> = {
    right: 'border-b border-l',
    left: 'border-t border-r',
    bottom: 'border-t border-l',
  };

  protected readonly steps = computed(() => {
    const first = this.domains.list()?.[0];
    return stepsFor(first ? { id: first.id, name: first.name } : null);
  });
  protected readonly index = signal(0);
  protected readonly step = computed(() => this.steps()[Math.min(this.index(), this.steps().length - 1)]);
  protected readonly last = computed(() => this.index() >= this.steps().length - 1);

  /** The measured element for the current step; null while its page loads. */
  private readonly rect = signal<DOMRect | null>(null);
  private readonly layout = signal(0);
  private seek = 0;

  protected readonly placed = computed<Placed | null>(() => {
    this.layout();
    const r = this.rect();
    if (!r) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(WIDTH, vw - 32);
    const ring = { top: r.top - RING, left: r.left - RING, width: r.width + RING * 2, height: r.height + RING * 2 };
    const side: Side = r.top < 90 ? 'bottom' : r.left + r.width / 2 > vw * 0.6 ? 'left' : 'right';
    let top: number;
    let left: number;
    if (side === 'bottom') {
      top = ring.top + ring.height + GAP;
      left = Math.min(Math.max(16, r.left + r.width / 2 - width / 2), vw - width - 16);
    } else {
      top = Math.min(Math.max(16, r.top + r.height / 2 - 40), vh - 200);
      left = side === 'right' ? ring.left + ring.width + GAP : ring.left - width - GAP;
      left = Math.min(Math.max(16, left), vw - width - 16);
    }
    const arrow =
      side === 'bottom'
        ? { top: -7, left: Math.min(Math.max(12, r.left + r.width / 2 - left - 6), width - 24) }
        : { top: Math.min(Math.max(12, r.top + r.height / 2 - top - 6), 150), left: side === 'right' ? -7 : width - 6 };
    return { ring, card: { top, left }, arrow, side };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    const bump = () => {
      this.layout.update((n) => n + 1);
      this.measure();
    };
    window.addEventListener('resize', bump);
    window.addEventListener('scroll', bump, true);
    destroyRef.onDestroy(() => {
      window.removeEventListener('resize', bump);
      window.removeEventListener('scroll', bump, true);
    });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.maybeStart(e.urlAfterRedirects));
    queueMicrotask(() => this.maybeStart(this.router.url));

    effect(() => {
      this.state.runs();
      untracked(() => this.index.set(0));
    });

    // Each step opens its page, then waits for its element to appear.
    effect(() => {
      if (!this.state.active()) return;
      const step = this.step();
      void this.show(step);
    });
  }

  private maybeStart(url: string): void {
    const customer = this.session.customer();
    if (!customer || this.state.active()) return;
    if (url.split('?')[0] === '/' && this.state.isQueued(customer.id)) this.state.start();
  }

  private async show(step: Step): Promise<void> {
    const ticket = ++this.seek;
    this.rect.set(null);
    if (this.router.url.split('?')[0] !== step.route) await this.router.navigateByUrl(step.route);
    // The page and the domain's menu load asynchronously: look for up to 4 seconds.
    for (let i = 0; i < 40 && ticket === this.seek; i++) {
      if (this.measure(step)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Not on screen (a closed drawer on small screens, or a menu item that isn't there): skip it.
    if (ticket === this.seek && this.state.active()) {
      if (this.last()) this.close();
      else this.index.update((i) => i + 1);
    }
  }

  private measure(step = this.step()): boolean {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    const r = el?.getBoundingClientRect();
    if (!el || !r || r.width === 0 || r.height === 0) return false;
    if (r.top < 0 || r.bottom > window.innerHeight) {
      el.scrollIntoView({ block: 'center' });
      this.rect.set(el.getBoundingClientRect());
    } else {
      this.rect.set(r);
    }
    return true;
  }

  protected go(delta: number): void {
    this.index.update((i) => Math.min(Math.max(0, i + delta), this.steps().length - 1));
  }

  protected close(): void {
    this.seek++;
    this.state.finish(this.session.customer()?.id);
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.state.active()) return;
    if (event.key === 'Escape') this.close();
    else if (event.key === 'ArrowRight' && !this.last()) this.go(1);
    else if (event.key === 'ArrowLeft' && this.index() > 0) this.go(-1);
  }
}
