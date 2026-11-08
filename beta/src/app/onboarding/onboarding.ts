import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../api';
import { Session } from '../session';
import { Alert } from '../alert/alert';
import { DitherShader } from '../login/dither-shader';

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

type Question = 'organization' | 'useCase' | 'teamSize' | 'source' | 'sourceDetail' | 'domain';

// How long the assistant "types" before a question shows; none with reduced motion.
const TYPING_MS = 650;

/**
 * First sign-in of a new organization's owner, as a chat with the setup assistant:
 * one question at a time, answers as bubbles, then the first domain.
 */
@Component({
  selector: 'amelu-onboarding',
  imports: [Alert, DitherShader, NgTemplateOutlet],
  templateUrl: './onboarding.html',
  styles: `
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
    .rise {
      animation: rise 0.28s ease-out both;
    }
    @keyframes blink {
      0%,
      80%,
      100% {
        opacity: 0.25;
      }
      40% {
        opacity: 1;
      }
    }
    .typing-dot {
      animation: blink 1.2s infinite both;
    }
    @media (prefers-reduced-motion: reduce) {
      .rise,
      .typing-dot {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative isolate flex h-dvh flex-col overflow-hidden bg-bg text-ink', '(document:keydown)': 'pickByKey($event)' },
})
export class Onboarding {
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  protected readonly useCases = USE_CASES;
  protected readonly teamSizes = TEAM_SIZES;
  protected readonly sources = SOURCES;

  protected readonly firstName = computed(() => this.session.customer()?.firstName || this.session.customer()?.name.split(' ')[0] || '');

  protected readonly organizationName = signal(this.session.customer()?.organizationName ?? '');
  protected readonly useCase = signal('');
  protected readonly teamSize = signal('');
  protected readonly source = signal('');
  protected readonly sourceDetail = signal('');
  protected readonly domainInput = signal('');
  /** What's in the text box for the current question, sent with Enter. */
  protected readonly draft = signal(this.organizationName());

  protected readonly current = signal<Question>('organization');
  protected readonly typing = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Set once the domain question is answered, for the last assistant line before leaving. */
  protected readonly leaving = signal<string | null>(null);
  private saved = false;

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly textbox = viewChild<ElementRef<HTMLInputElement>>('textbox');

  protected readonly detailPrompt = computed(() => {
    switch (this.source()) {
      case 'other':
        return 'Where was that?';
      case 'review':
      case 'directory':
      case 'reddit':
        return 'Which one? Totally optional.';
      default:
        return null;
    }
  });

  /** The questions in order; the follow-up on the source only when it has one. */
  protected readonly questions = computed<Question[]>(() => [
    'organization',
    'useCase',
    'teamSize',
    'source',
    ...(this.detailPrompt() ? (['sourceDetail'] as const) : []),
    'domain',
  ]);
  protected readonly index = computed(() => this.questions().indexOf(this.current()));
  protected readonly answered = computed(() => this.questions().slice(0, this.index()));

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

  constructor() {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    effect((onCleanup) => {
      this.current();
      this.typing.set(true);
      const timer = setTimeout(() => this.typing.set(false), reduced ? 0 : TYPING_MS);
      onCleanup(() => clearTimeout(timer));
    });
    // Keep the newest message in view and the cursor in the text box once the question shows.
    afterRenderEffect(() => {
      this.current();
      this.leaving();
      const typing = this.typing();
      this.scroller()?.nativeElement.scrollTo({ top: 1e6, behavior: reduced ? 'auto' : 'smooth' });
      if (!typing) this.textbox()?.nativeElement.focus({ preventScroll: true });
    });
  }

  protected readonly greeting = computed(
    () =>
      `Hi${this.firstName() ? ' ' + this.firstName() : ''}, welcome to Amelu! I'll get your account ready with a few quick questions. It takes under a minute.`,
  );

  protected farewell(domain: string): string {
    return `Great choice. Taking you to ${domain} now, where you'll see the DNS records to add.`;
  }

  /** The assistant's line for a question; it reads earlier answers so it sounds like it listened. */
  protected ask(question: Question): string {
    switch (question) {
      case 'organization':
        return "First things first: what should we call your organization? Your company, family or project is fine, and you can change it later.";
      case 'useCase': {
        const name = this.organizationName().trim();
        return name ? `${name}, nice. What will you use Amelu for?` : 'No problem. What will you use Amelu for?';
      }
      case 'teamSize':
        return this.useCase() === 'agency' ? 'Got it. How many people will use email, across your clients?' : 'Got it. How many people will use email?';
      case 'source':
        return "Thanks. One for us: how did you find Amelu? We're a small team, so this helps us know where to show up.";
      case 'sourceDetail':
        return this.detailPrompt()!;
      case 'domain':
        return "That's all I needed. Now the fun part: which domain do you want to use for email? It's the part after the @, and it stays at your current registrar.";
    }
  }

  /** How an answer shows as your bubble. */
  protected reply(question: Question): string {
    const label = (list: Choice[], value: string) => (value ? (list.find((choice) => choice.value === value)?.label ?? value) : 'Skip');
    switch (question) {
      case 'organization':
        return this.organizationName().trim() || 'Skip';
      case 'useCase':
        return label(USE_CASES, this.useCase());
      case 'teamSize':
        return label(TEAM_SIZES, this.teamSize());
      case 'source':
        return label(SOURCES, this.source());
      case 'sourceDetail':
        return this.sourceDetail().trim() || 'Skip';
      case 'domain':
        return this.domain();
    }
  }

  /** Answers can be changed until they're saved, right before the domain question. */
  protected canEdit(): boolean {
    return !this.saved && !this.busy();
  }

  protected edit(question: Question): void {
    if (!this.canEdit()) return;
    this.error.set(null);
    this.draft.set(question === 'organization' ? this.organizationName() : question === 'sourceDetail' ? this.sourceDetail() : '');
    this.current.set(question);
  }

  protected choose(question: Question, value: string): void {
    if (this.typing() || this.busy()) return;
    if (question === 'useCase') this.useCase.set(value);
    if (question === 'teamSize') this.teamSize.set(value);
    if (question === 'source') {
      if (this.source() !== value) this.sourceDetail.set('');
      this.source.set(value);
    }
    this.advance();
  }

  /** 1 to 9 picks a quick reply, unless you're typing somewhere. */
  protected pickByKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement | null)?.closest('input, textarea')) return;
    const question = this.current();
    const list = question === 'useCase' ? USE_CASES : question === 'teamSize' ? TEAM_SIZES : question === 'source' ? SOURCES : null;
    const choice = list?.[Number(event.key) - 1];
    if (!choice || this.leaving()) return;
    event.preventDefault();
    this.choose(question, choice.value);
  }

  protected send(event: Event): void {
    event.preventDefault();
    if (this.typing() || this.busy()) return;
    const question = this.current();
    if (question === 'organization') this.organizationName.set(this.draft());
    if (question === 'sourceDetail') this.sourceDetail.set(this.draft());
    if (question === 'domain') {
      void this.addDomain();
      return;
    }
    this.advance();
  }

  protected skipQuestion(): void {
    if (this.current() === 'organization') this.organizationName.set('');
    if (this.current() === 'sourceDetail') this.sourceDetail.set('');
    this.advance();
  }

  private advance(): void {
    this.error.set(null);
    const next = this.questions()[this.index() + 1];
    // Save before the domain question, so leaving from there keeps the answers.
    if (next === 'domain') {
      void this.save().then((ok) => ok && this.move(next));
    } else {
      this.move(next);
    }
  }

  private move(next: Question): void {
    this.draft.set(next === 'sourceDetail' ? this.sourceDetail() : '');
    this.current.set(next);
  }

  /** Into the regular "Add domain" page, filled in, so standard addresses and DNS help come with it. */
  private async addDomain(): Promise<void> {
    if (!this.domainValid()) return;
    if (!(await this.save())) return;
    this.leaving.set(this.domain());
    await new Promise((resolve) => setTimeout(resolve, 700));
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
