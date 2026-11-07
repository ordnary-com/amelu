import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { Session } from '../session';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { UI } from '../ui';

interface Choice {
  value: string;
  label: string;
  hint?: string;
}

// The values match the lists in backend/internal/handlers/onboarding.go.
const USE_CASES: Choice[] = [
  { value: 'personal', label: 'Personal', hint: 'My own name or family domain' },
  { value: 'business', label: 'My business', hint: 'Email for a company or shop' },
  { value: 'agency', label: 'Clients', hint: 'I set up email for others' },
  { value: 'nonprofit', label: 'Nonprofit or club', hint: 'A foundation, school or society' },
  { value: 'other', label: 'Something else' },
];

const TEAM_SIZES: Choice[] = [
  { value: '1', label: 'Just me' },
  { value: '2-10', label: '2 to 10' },
  { value: '11-50', label: '11 to 50' },
  { value: '51+', label: 'More than 50' },
];

const SOURCES: Choice[] = [
  { value: 'search', label: 'Search engine', hint: 'Google, Bing, DuckDuckGo' },
  { value: 'social', label: 'Social media', hint: 'Instagram, LinkedIn, X, TikTok' },
  { value: 'reddit', label: 'Reddit or a forum' },
  { value: 'friend', label: 'A friend or colleague' },
  { value: 'review', label: 'A review, blog or video' },
  { value: 'directory', label: 'A comparison or alternatives site' },
  { value: 'ai', label: 'An AI assistant', hint: 'ChatGPT, Claude, Perplexity' },
  { value: 'ordnary', label: 'Through Ordnary' },
  { value: 'other', label: 'Somewhere else' },
];

/** First sign-in of a new organization's owner: a few questions, then the first domain. */
@Component({
  selector: 'amelu-onboarding',
  imports: [Alert, Icon],
  templateUrl: './onboarding.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh flex-col bg-bg text-ink' },
})
export class Onboarding {
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  protected readonly ui = UI;
  protected readonly useCases = USE_CASES;
  protected readonly teamSizes = TEAM_SIZES;
  protected readonly sources = SOURCES;

  protected readonly step = signal<1 | 2 | 3>(1);
  protected readonly firstName = computed(() => this.session.customer()?.firstName || this.session.customer()?.name.split(' ')[0] || '');

  protected readonly organizationName = signal(this.session.customer()?.organizationName ?? '');
  protected readonly useCase = signal('');
  protected readonly teamSize = signal('');
  protected readonly source = signal('');
  protected readonly sourceDetail = signal('');
  protected readonly domainInput = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private saved = false;

  /** What people paste is often a URL or an address; keep only the domain part. */
  protected readonly domain = computed(() =>
    this.domainInput()
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^.*@/, '')
      .replace(/[/?#].*$/, '')
      .replace(/\.$/, ''),
  );
  protected readonly domainValid = computed(() => /^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(this.domain()));
  protected readonly detailPrompt = computed(() => {
    switch (this.source()) {
      case 'other':
        return 'Where was that?';
      case 'review':
      case 'directory':
      case 'reddit':
        return 'Which one? (optional)';
      default:
        return null;
    }
  });

  protected next(event?: Event): void {
    event?.preventDefault();
    this.error.set(null);
    if (this.step() === 1) {
      this.step.set(2);
    } else if (this.step() === 2) {
      void this.save().then((ok) => ok && this.step.set(3));
    }
  }

  protected back(): void {
    this.error.set(null);
    if (this.step() > 1) this.step.set((this.step() - 1) as 1 | 2);
  }

  /** Into the regular "Add domain" page, filled in, so standard addresses and DNS help come with it. */
  protected async addDomain(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.domainValid() || this.busy()) return;
    if (!(await this.save())) return;
    await this.router.navigate(['/domains/new'], { queryParams: { name: this.domain() } });
  }

  protected async finish(): Promise<void> {
    if (!(await this.save())) return;
    await this.router.navigateByUrl('/');
  }

  /** Skipping still marks the account onboarded, so the flow doesn't come back. */
  protected async skip(): Promise<void> {
    if (!(await this.save(true))) return;
    await this.router.navigateByUrl('/');
  }

  private async save(skipped = false): Promise<boolean> {
    if (this.saved) return true;
    this.busy.set(true);
    this.error.set(null);
    try {
      const customer = await firstValueFrom(
        this.api.completeOnboarding(
          skipped
            ? {}
            : {
                organizationName: this.organizationName().trim(),
                useCase: this.useCase(),
                teamSize: this.teamSize(),
                source: this.source(),
                sourceDetail: this.detailPrompt() ? this.sourceDetail().trim() : '',
              },
        ),
      );
      this.session.customer.set(customer);
      this.saved = true;
      return true;
    } catch (err) {
      this.error.set(errorMessage(err, 'Your answers could not be saved. Try again.'));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
