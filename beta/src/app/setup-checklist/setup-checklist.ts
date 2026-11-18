import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, forkJoin, map, of, switchMap } from 'rxjs';
import { Api, Domain, Mailbox } from '../api';
import { Domains } from '../domains';
import { Icon } from '../icon';
import { isFree } from '../billing';
import { STANDARD_ADDRESSES } from '../standard-addresses';
import { WebmailApi } from '../organization-webmail/webmail-api';
import { markSetupStep, setupFlags } from '../setup-progress';

interface Step {
  title: string;
  text: string;
  done: boolean;
  link: string;
  fragment?: string;
  action: string;
}

/**
 * The first things to do with a new account, in the Overview banner until
 * they're done or hidden: every step as a segment, and the next one with what
 * it's for and a button to do it.
 */
@Component({
  selector: 'amelu-setup-checklist',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Hidden entirely when there's nothing to show, so the hero next to it takes the full width.
  host: { class: 'block', '[class.hidden]': '!visible()' },
  template: `
    @if (visible() && steps(); as list) {
      <section class="w-full max-w-[760px] rounded-lg border border-line/60 bg-surface/80 p-4 backdrop-blur-sm" aria-labelledby="setup-title">
        <div class="flex items-center gap-3">
          <h2 id="setup-title" class="text-[14px] font-medium text-ink">Get Amelu ready</h2>
          <span class="text-[12px] tabular-nums text-muted">{{ doneCount() }} of {{ list.length }} done</span>
          <button type="button" class="ml-auto cursor-pointer text-[12px] text-muted hover:text-ink hover:underline" (click)="hide()">Hide</button>
        </div>

        <!-- Every step as a segment: a bar that fills when done, the next one half-lit. -->
        <ol class="mt-3 grid gap-3" [style.grid-template-columns]="'repeat(' + list.length + ', minmax(0, 1fr))'">
          @for (step of list; track step.title; let i = $index) {
            <li>
              <a [routerLink]="step.link" [fragment]="step.fragment" class="group block" [attr.aria-current]="step === next() ? 'step' : null">
                <span class="block h-1 rounded-full" [class]="step.done ? 'bg-accent' : step === next() ? 'bg-accent/40' : 'bg-hero-ink/15'"></span>
                <span class="mt-2 flex items-start gap-1.5 text-[12px] leading-snug max-mobile:hidden" [class]="step.done ? 'text-muted' : step === next() ? 'font-medium text-ink' : 'text-muted'">
                  @if (step.done) {
                    <amelu-icon name="check" [size]="13" class="mt-px flex-none text-link" />
                  } @else {
                    <span class="flex-none tabular-nums">{{ i + 1 }}.</span>
                  }
                  <span class="group-hover:underline">{{ step.title }}</span>
                </span>
              </a>
            </li>
          }
        </ol>

        @if (next(); as step) {
          <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3">
            <p class="min-w-0 text-[13px]">
              <span class="font-medium text-ink">Next: {{ step.title }}.</span>
              <span class="text-muted"> {{ step.text }}</span>
            </p>
            <a [routerLink]="step.link" [fragment]="step.fragment" class="inline-flex h-8 flex-none items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent/85">
              {{ step.action }}
              <amelu-icon name="arrowRight" [size]="14" />
            </a>
          </div>
        }
      </section>
    }
  `,
})
export class SetupChecklist {
  private readonly api = inject(Api);
  private readonly webmail = inject(WebmailApi);
  private readonly domains = inject(Domains).list;
  private readonly flags = signal(setupFlags());

  // Mailboxes of the first few domains: enough to tell whether one was made.
  private readonly mailboxes = toSignal(
    toObservable(this.domains).pipe(
      filter((list): list is Domain[] => !!list),
      switchMap((list) =>
        list.length === 0
          ? of([] as Mailbox[])
          : forkJoin(list.slice(0, 5).map((d) => this.api.listMailboxes(d.id).pipe(catchError(() => of([] as Mailbox[]))))).pipe(
              map((lists) => lists.flat()),
            ),
      ),
    ),
  );
  private readonly plan = toSignal(this.api.billingOverview().pipe(map((o) => o.plan), catchError(() => of(null))));
  private readonly branding = toSignal(this.webmail.get().pipe(catchError(() => of(null))));

  protected readonly steps = computed<Step[] | null>(() => {
    const domains = this.domains();
    const mailboxes = this.mailboxes();
    if (!domains || mailboxes === undefined) return null;
    const first = domains[0];
    const pending = domains.find((d) => d.status !== 'active') ?? first;
    const own = mailboxes.find((m) => !STANDARD_ADDRESSES.includes(m.localPart));
    const steps: Step[] = [
      { title: 'Add your domain', text: 'The domain your addresses will end in.', done: domains.length > 0, link: '/domains/new', action: 'Add domain' },
      {
        title: 'Point your DNS at Amelu',
        text: 'A few records at your registrar, so mail for your domain arrives here.',
        done: domains.some((d) => d.status === 'active'),
        link: pending ? `/domains/${pending.id}/dns` : '/domains/new',
        action: 'Set up DNS',
      },
      {
        title: 'Create your own mailbox',
        text: 'Like you@ or hello@. The standard addresses are already there.',
        done: !!own,
        link: first ? `/domains/${first.id}/mailboxes/new` : '/domains/new',
        action: 'Create mailbox',
      },
      {
        title: 'Connect a phone or mail app',
        text: 'Scan a QR code on your iPhone, or follow the steps for your app.',
        done: !!this.flags().device,
        link: own ? `/domains/${own.domainId}/mailboxes/${own.id}/usage` : first ? `/domains/${first.id}/mailboxes` : '/domains/new',
        fragment: own ? 'phone' : undefined,
        action: 'Connect',
      },
    ];
    const plan = this.plan();
    if (plan && !isFree(plan)) {
      steps.push({
        title: 'Give webmail your brand',
        text: 'Your name, colour and address for the webmail your team signs in to.',
        done: !!this.branding()?.enabled,
        link: '/organization/webmail',
        action: 'Brand webmail',
      });
    }
    return steps;
  });

  protected readonly doneCount = computed(() => this.steps()?.filter((s) => s.done).length ?? 0);
  protected readonly next = computed(() => this.steps()?.find((s) => !s.done));
  protected readonly visible = computed(() => {
    const steps = this.steps();
    return !this.flags().dismissed && !!steps && steps.some((s) => !s.done);
  });

  protected hide(): void {
    markSetupStep('dismissed');
    this.flags.set(setupFlags());
  }
}
