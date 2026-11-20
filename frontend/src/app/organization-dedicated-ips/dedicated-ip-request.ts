import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of } from 'rxjs';
import { Api, DedicatedIpUseCase, DedicatedIpVolume, errorMessage } from '../api';
import { Domains } from '../domains';
import { Session } from '../session';
import { Alert } from '../alert/alert';
import { Icon } from '../icon';
import { UI } from '../ui';
import { DEDICATED_IP_USE_CASES, DEDICATED_IP_VOLUMES } from '../support/support-meta';

const DEFAULT_MESSAGE = "Hi, we'd like a dedicated IP so our mail no longer shares its reputation with other senders.";

/**
 * /organization/dedicated-ips/request: a few questions that open a dedicated
 * IP request, a support ticket of its own kind (category dedicated_ip).
 */
@Component({
  selector: 'amelu-dedicated-ip-request',
  imports: [Alert, Icon, RouterLink],
  template: `
    <div class="space-y-5">
      @if (open(); as req) {
        <section [class]="ui.setCard">
          <div [class]="ui.setHeader"><h2 [class]="ui.setTitle">You Already Have a Request</h2></div>
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p class="text-[14px] text-muted">Your organization's dedicated IP request is still open. Follow it, and pay once it's approved, in its ticket.</p>
            <a [routerLink]="['/support/tickets', req.ticketId]" [class]="ui.primary + ' h-9'">Open the request</a>
          </div>
        </section>
      } @else if (!canRequest()) {
        <section [class]="ui.setCard">
          <div [class]="ui.setHeader"><h2 [class]="ui.setTitle">Request a Dedicated IP</h2></div>
          <p [class]="ui.setNote">
            <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
            <span>Only owners and admins can request a dedicated IP, since it adds €10 a month to your bill. Ask one of them.</span>
          </p>
        </section>
      } @else {
        <form [class]="ui.setCard" (submit)="submit($event)">
          <div [class]="ui.setHeader"><h2 [class]="ui.setTitle">Request a Dedicated IP</h2></div>
          <div class="space-y-5 px-5 py-4">
            @if (error(); as message) {
              <amelu-alert>{{ message }}</amelu-alert>
            }

            <fieldset>
              <legend [class]="label">How much mail do you send a month?</legend>
              <div class="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Monthly volume">
                @for (v of volumes; track v.id) {
                  @let on = volume() === v.id;
                  <label [class]="ui.choice + ' px-3.5 py-3 text-[14px] font-medium ' + (on ? ui.choiceOn + ' text-link' : ui.choiceOff)">
                    <input type="radio" name="volume" class="sr-only" [checked]="on" (change)="volume.set(v.id)" />
                    {{ v.label }}
                  </label>
                }
              </div>
            </fieldset>

            <fieldset>
              <legend [class]="label">What do you send?</legend>
              <div class="mt-1.5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What you send">
                @for (u of useCases; track u.id) {
                  @let on = useCase() === u.id;
                  <label [class]="ui.choice + ' flex items-center gap-3 px-3.5 py-3 ' + (on ? ui.choiceOn : ui.choiceOff)">
                    <input type="radio" name="use-case" class="sr-only" [checked]="on" (change)="useCase.set(u.id)" />
                    <amelu-icon [name]="u.icon" [size]="20" class="flex-none" [class]="on ? 'text-link' : 'text-ink'" />
                    <span class="min-w-0">
                      <span class="block text-[14px] font-medium" [class.text-link]="on">{{ u.label }}</span>
                      <span class="block truncate text-[12px]" [class]="on ? 'text-link/85' : 'text-muted'">{{ u.hint }}</span>
                    </span>
                  </label>
                }
              </div>
            </fieldset>

            @if (domainNames().length) {
              <fieldset>
                <legend [class]="label">Which domains should send from it?</legend>
                <div class="mt-1.5 flex flex-wrap gap-2">
                  @for (name of domainNames(); track name) {
                    @let on = picked().has(name);
                    <label [class]="ui.choice + ' inline-flex items-center gap-2 px-3 py-1.5 text-[13px] ' + (on ? ui.choiceOn + ' text-link' : ui.choiceOff)">
                      <input type="checkbox" class="sr-only" [checked]="on" (change)="toggle(name)" />
                      <amelu-icon [name]="on ? 'check' : 'globe'" [size]="14" class="flex-none" />
                      {{ name }}
                    </label>
                  }
                </div>
                <p [class]="ui.hint">A dedicated IP sends for all of your organization's domains; this tells us which matter most.</p>
              </fieldset>
            }

            <div>
              <label for="dedicated-message" [class]="label">Anything else we should know?</label>
              <textarea
                id="dedicated-message"
                rows="4"
                [class]="ui.input + ' h-auto py-2 text-[14px] leading-relaxed [field-sizing:content]'"
                [value]="message()"
                (input)="message.set($any($event.target).value)"
              ></textarea>
            </div>

            <div class="flex items-center justify-end gap-2">
              <a routerLink="/organization/dedicated-ips" [class]="ui.outline + ' h-9'">Cancel</a>
              <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="!canSubmit()">{{ sending() ? 'Sending...' : 'Send request' }}</button>
            </div>
          </div>
          <p [class]="ui.setNote">
            <amelu-icon name="info" [size]="16" class="mt-0.5 flex-none" />
            <span>A dedicated IP is €10 a month per address, on every plan. We check your request first; you only pay once it's approved.</span>
          </p>
        </form>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DedicatedIpRequestPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly domains = inject(Domains).list;
  private readonly session = inject(Session);
  protected readonly ui = UI;
  protected readonly label = 'block text-[13px] text-muted';
  protected readonly volumes = DEDICATED_IP_VOLUMES;
  protected readonly useCases = DEDICATED_IP_USE_CASES;

  protected readonly canRequest = computed(() => ['owner', 'admin'].includes(this.session.customer()?.role ?? ''));
  protected readonly open = toSignal(this.api.openDedicatedIpRequest().pipe(catchError(() => of(null))));

  protected readonly volume = signal<DedicatedIpVolume | null>(null);
  protected readonly useCase = signal<DedicatedIpUseCase | null>(null);
  protected readonly message = signal(DEFAULT_MESSAGE);
  protected readonly picked = signal(new Set<string>());
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly domainNames = computed(() => (this.domains() ?? []).map((d) => d.name));
  protected readonly canSubmit = computed(() => !this.sending() && !!this.volume() && !!this.useCase());

  constructor() {
    // Every domain starts picked.
    effect(() => {
      const names = this.domainNames();
      if (names.length && !this.picked().size) this.picked.set(new Set(names));
    });
  }

  protected toggle(name: string): void {
    this.picked.update((set) => {
      const next = new Set(set);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const volume = this.volume(), useCase = this.useCase();
    if (!volume || !useCase || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      const req = await firstValueFrom(
        this.api.createDedicatedIpRequest({
          volume,
          useCase,
          domains: this.domainNames().filter((n) => this.picked().has(n)).join(', '),
          message: this.message().trim() === DEFAULT_MESSAGE ? '' : this.message().trim(),
        }),
      );
      await this.router.navigate(['/support/tickets', req.ticketId]);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not send the request'));
    } finally {
      this.sending.set(false);
    }
  }
}
