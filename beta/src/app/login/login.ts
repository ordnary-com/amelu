import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ordnaryLoginUrl } from '../config';
import { Session } from '../session';
import { DitherShader } from './dither-shader';
import { TechInfo } from './tech-info';

// What the API's Ordnary callback redirects back with
// (backend/internal/handlers/ordnary_auth.go).
const ERRORS: Record<string, string> = {
  ordnary_auth_failed: 'Sign-in failed. Please try again.',
  ordnary_email_unverified: "Verify your Ordnary account's email address, then sign in again.",
  ordnary_account_mismatch:
    'This email address belongs to an Amelu account linked to a different Ordnary account. Contact support.',
};

const OVERLAY_MIN_MS = 700;

/** The legal links of the amelu.org footer, plus where to get help. */
const FOOTER_LINKS = [
  { label: 'Contact', href: 'https://ordnary.com/contact' },
  { label: 'Privacy', href: 'https://amelu.org/privacy' },
  { label: 'Terms', href: 'https://amelu.org/terms' },
  { label: 'Acceptable use', href: 'https://amelu.org/acceptable-use' },
  { label: 'Refunds', href: 'https://amelu.org/refund-policy' },
  { label: 'DPA', href: 'https://amelu.org/dpa' },
];

/**
 * Sign in through Ordnary, in the layout of the Web Services sign-in: a wide
 * brand panel with an animated dither, the sign-in on the right and a footer bar
 * across the bottom. The button shows straight away; someone who turns out to
 * have a session goes on to the dashboard without being asked.
 */
@Component({
  selector: 'amelu-login',
  imports: [DitherShader, TechInfo],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-dvh flex-col bg-[#171d25] text-[#dedee3] [color-scheme:dark]',
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
  /** The message on the loading overlay while it's shown, null when hidden. */
  protected readonly overlay = signal<string | null>(null);
  protected readonly busy = computed(() => this.overlay() !== null);

  protected readonly footerLinks = FOOTER_LINKS;
  protected readonly year = new Date().getFullYear();

  constructor() {
    void this.session.load().then((signedIn) => {
      if (!signedIn) return;
      void this.router.navigateByUrl(this.returnTo(), { replaceUrl: true });
    });
  }

  protected async start(event: MouseEvent): Promise<void> {
    // Cmd/Ctrl-click opens the sign-in in a new tab; leave that alone.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (this.busy()) return;
    await this.showOverlay('Signing you in with Ordnary');
    window.location.href = this.loginUrl();
  }

  // Shows the overlay and waits a moment, so the step registers instead of
  // the page flickering straight to the next one.
  private showOverlay(message: string): Promise<void> {
    this.overlay.set(message);
    return new Promise((resolve) => setTimeout(resolve, OVERLAY_MIN_MS));
  }

  // Going back here restores the page from the back/forward cache with the
  // overlay still up; take it down.
  protected onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) this.overlay.set(null);
  }
}
