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
 * The first things to do with a new account, as one line in the Overview
 * banner until they're done or hidden: progress and a link to the next step.
 */
@Component({
  selector: 'amelu-setup-checklist',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Hidden entirely when there's nothing to show, so the hero next to it takes the full width.
  host: { class: 'block', '[class.hidden]': '!visible()' },
  template: `
    @if (visible() && steps(); as list) {
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-surface/60 px-4 py-2.5" aria-label="Get Amelu ready">
        <span class="text-[13px] font-semibold text-ink">Get Amelu ready</span>
        <span class="flex items-center gap-2">
          <span class="h-1.5 w-24 overflow-hidden rounded-full bg-hero-ink/15">
            <span class="block h-full rounded-full bg-accent transition-[width]" [style.width.%]="(doneCount() / list.length) * 100"></span>
          </span>
          <span class="text-[12px] tabular-nums text-hero-ink/75">{{ doneCount() }} of {{ list.length }} done</span>
        </span>
        @if (next(); as step) {
          <a [routerLink]="step.link" [fragment]="step.fragment" class="inline-flex items-center gap-1 text-[13px] font-medium text-link hover:underline">
            Next: {{ step.title }} <amelu-icon name="arrowRight" [size]="13" />
          </a>
        }
        <button type="button" class="cursor-pointer text-[12px] text-hero-ink/60 hover:text-ink hover:underline" (click)="hide()">Hide</button>
      </div>
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
