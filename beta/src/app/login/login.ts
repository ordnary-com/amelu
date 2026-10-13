import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ordnaryLoginUrl } from '../config';
import { Session } from '../session';
import { TechInfo } from './tech-info';

// What the API's Ordnary callback redirects back with
// (backend/internal/handlers/ordnary_auth.go).
const ERRORS: Record<string, string> = {
  ordnary_auth_failed: 'Sign-in failed. Please try again.',
  ordnary_email_unverified: "Verify your Ordnary account's email address, then sign in again.",
  ordnary_account_mismatch:
    'This email address belongs to an Amelu account linked to a different Ordnary account. Contact support.',
};

// Photos in public/login, credits in public/login/CREDITS.txt.
const SLIDES = [
  { image: '/login/work-1.webp', title: 'Email on your own domain', text: 'Addresses your customers recognise, set up in minutes.' },
  { image: '/login/work-2.webp', title: 'Built for teams', text: 'Mailboxes, aliases and shared addresses for everyone you work with.' },
  { image: '/login/work-3.webp', title: 'Fully managed', text: 'Spam filtering, DNS checks and security handled for you.' },
  { image: '/login/work-4.webp', title: 'Work from anywhere', text: 'Use the mail app you already like, on every device.' },
  { image: '/login/work-5.webp', title: 'Hosted in the EU', text: 'Your mail and data stay on servers in the EU, under EU privacy law.' },
];

const SLIDE_INTERVAL_MS = 6000;
const OVERLAY_MIN_MS = 700;

/**
 * Sign in through Ordnary. Someone with a session gets asked first whether to
 * continue with that account or sign in with another one.
 */
@Component({
  selector: 'amelu-login',
  imports: [TechInfo],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-dvh flex-col items-center gap-6 p-4',
    '(window:pageshow)': 'onPageShow($event)',
  },
})
export class Login {
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly error = computed(() => {
    const code = this.params()?.get('error');
    return code ? (ERRORS[code] ?? ERRORS['ordnary_auth_failed']) : null;
  });

  private readonly returnTo = computed(() => {
    const value = this.params()?.get('returnTo') ?? '/';
    return value.startsWith('/') && !value.startsWith('//') ? value : '/';
  });

  protected readonly loginUrl = computed(() => ordnaryLoginUrl(this.returnTo()));

  private readonly session = inject(Session);
  /** 'checking' until GET /api/me answers, then 'found' with a session or 'signin' without. */
  protected readonly view = signal<'checking' | 'found' | 'signin'>('checking');
  protected readonly customer = this.session.customer;
  protected readonly avatarFailed = signal(false);
  protected readonly initials = computed(() => {
    const customer = this.customer();
    const source = (customer?.name || customer?.email || '').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  });
  /** The message on the loading overlay while it's shown, null when hidden. */
  protected readonly overlay = signal<string | null>(null);
  protected readonly busy = computed(() => this.overlay() !== null);

  protected readonly slides = SLIDES;
  protected readonly slide = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    this.restartTimer();
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));

    void this.session.load().then((signedIn) => this.view.set(signedIn ? 'found' : 'signin'));
  }

  protected async continue(): Promise<void> {
    if (this.busy()) return;
    await this.showOverlay('Opening your dashboard');
    this.session.clearLoginPending();
    await this.router.navigateByUrl(this.returnTo());
  }

  // Ends the Amelu session, then has Ordnary show its sign-in form even
  // though Ordnary itself is still signed in as the old account.
  protected async useAnotherAccount(): Promise<void> {
    if (this.busy()) return;
    await Promise.all([this.showOverlay('Signing you out'), this.session.signOut()]);
    this.session.markLoginPending();
    window.location.href = ordnaryLoginUrl(this.returnTo(), true);
  }

  protected async start(event: MouseEvent): Promise<void> {
    // Cmd/Ctrl-click opens the sign-in in a new tab; leave that alone.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (this.busy()) return;
    await this.showOverlay('Signing you in with Ordnary');
    this.session.markLoginPending();
    window.location.href = this.loginUrl();
  }

  // Shows the overlay and waits a moment, so the step registers instead of
  // the page flickering straight to the next one.
  private showOverlay(message: string): Promise<void> {
    this.overlay.set(message);
    return new Promise((resolve) => setTimeout(resolve, OVERLAY_MIN_MS));
  }

  protected show(index: number): void {
    this.slide.set(index);
    this.restartTimer();
  }

  // Clicking a dot starts the wait for the next slide over.
  private restartTimer(): void {
    clearInterval(this.timer);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.timer = setInterval(() => this.slide.update((i) => (i + 1) % SLIDES.length), SLIDE_INTERVAL_MS);
  }

  // Going back here restores the page from the back/forward cache with the
  // overlay still up; take it down.
  protected onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) this.overlay.set(null);
  }
}
