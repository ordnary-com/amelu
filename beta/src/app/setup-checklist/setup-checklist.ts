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
 * The first things to do with a new account, as a panel on the Overview until
 * they're done or hidden: a box per step, the next one outlined with its action.
 */
@Component({
  selector: 'amelu-setup-checklist',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Hidden entirely when there's nothing to show, so the hero next to it takes the full width.
  host: { class: 'block', '[class.hidden]': '!visible()' },
  template: `
    @if (visible() && steps(); as list) {
      <section class="overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.05)]" aria-labelledby="setup-title">
        <div class="flex h-11 items-center gap-3 border-b border-line px-4">
          <h2 id="setup-title" class="text-[15px] font-medium">Get Amelu ready</h2>
          <span class="text-[13px] tabular-nums text-muted">({{ doneCount() }} of {{ list.length }} done)</span>
          <button type="button" class="ml-auto cursor-pointer text-[13px] text-muted hover:text-ink hover:underline" (click)="hide()">Hide</button>
        </div>

        <ol class="grid gap-4 bg-well p-4 sm:grid-cols-2" [class.xl:grid-cols-4]="list.length === 4" [class.xl:grid-cols-5]="list.length === 5">
          @for (step of list; track step.title; let i = $index) {
            <li>
              <a
                [routerLink]="step.link"
                [fragment]="step.fragment"
                class="flex h-full flex-col rounded-md border bg-surface px-4 py-3 hover:border-ink/20"
                [class]="step === next() ? 'border-accent' : 'border-line'"
                [attr.aria-current]="step === next() ? 'step' : null"
              >
                <span class="flex items-center gap-2 text-[13px]">
                  @if (step.done) {
                    <amelu-icon name="circleCheck" [size]="16" class="flex-none text-ok" />
                  } @else {
                    <span class="flex size-4 flex-none items-center justify-center rounded-full border text-[10px] tabular-nums" [class]="step === next() ? 'border-accent text-link' : 'border-line text-muted'">{{ i + 1 }}</span>
                  }
                  <span class="font-medium" [class.text-muted]="step.done">{{ step.title }}</span>
                </span>
                <span class="mt-1 text-[12px] leading-snug text-muted">{{ step.done ? 'Done' : step.text }}</span>
                @if (step === next()) {
                  <span class="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-link">{{ step.action }} <amelu-icon name="arrowRight" [size]="13" /></span>
                }
              </a>
            </li>
          }
        </ol>
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
