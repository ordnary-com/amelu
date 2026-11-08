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
 * The first things to do with a new account, on the home page until they're
 * done or hidden. Each step links to where it's done.
 */
@Component({
  selector: 'amelu-setup-checklist',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (visible() && steps(); as list) {
      <section class="rounded-lg border border-line bg-surface p-4" aria-labelledby="setup-title">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="setup-title" class="text-[14px] font-bold">Get Amelu ready</h2>
            <p class="mt-0.5 text-[12px] text-muted">{{ doneCount() }} of {{ list.length }} done</p>
          </div>
          <button type="button" class="cursor-pointer text-[12px] text-muted hover:text-ink hover:underline" (click)="hide()">Hide</button>
        </div>
        <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-bg">
          <div class="h-full rounded-full bg-accent transition-[width]" [style.width.%]="(doneCount() / list.length) * 100"></div>
        </div>
        <ol class="mt-4 space-y-1">
          @for (step of list; track step.title; let i = $index) {
            <li class="flex items-start gap-3 rounded-md px-2 py-2" [class.bg-bg]="step === next()">
              @if (step.done) {
                <span class="mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-full bg-ok text-white">
                  <amelu-icon name="check" [size]="12" />
                </span>
              } @else {
                <span class="mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-full border border-line text-[11px] font-bold text-muted">{{ i + 1 }}</span>
              }
              <span class="min-w-0 flex-1">
                <span class="block text-[13px] font-semibold" [class.text-muted]="step.done" [class.line-through]="step.done">{{ step.title }}</span>
                @if (!step.done) {
                  <span class="block text-[12px] text-muted">{{ step.text }}</span>
                }
              </span>
              @if (!step.done) {
                <a [routerLink]="step.link" [fragment]="step.fragment" class="flex-none text-[12px] font-semibold text-link hover:underline">{{ step.action }}</a>
              }
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
