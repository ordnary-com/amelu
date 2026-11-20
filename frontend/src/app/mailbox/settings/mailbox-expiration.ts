import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { badgeClass } from '../../status';
import { UI } from '../../ui';
import { MailboxApi, MailboxExpiration as Expiration } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';

/** The current dashboard's MailboxExpirationPage: suspend or erase the mailbox on a set date. */
@Component({
  selector: 'amelu-mailbox-expiration',
  imports: [EmptyState, Icon, MailboxHeading, SaveFeedback],
  template: `
    <amelu-mailbox-heading title="Mailbox expiration">
      Suspend this mailbox on a set date, or erase it for good, for example for a temporary address.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <form class="min-w-0 space-y-5" (submit)="submit($event)">
        <amelu-save-feedback [state]="save" success="Expiration saved." />

        @if (loaded() === null) {
          <amelu-empty-state class="rounded border border-line bg-surface" title="The expiration couldn't be loaded" [error]="true" [compact]="true" />
        } @else {
          <section [class]="ui.setCard">
            <div [class]="ui.setHeader">
              <h2 [class]="ui.setTitle">Expiration</h2>
              @if (current(); as c) {
                <span [class]="!c.date ? badge.neutral : c.erase ? badge.bad : badge.warn">
                  {{ !c.date ? 'Never expires' : c.erase ? 'Erased on expiry' : 'Suspended on expiry' }}
                </span>
              }
            </div>
            <ul class="divide-y divide-line">
              <li class="flex items-center gap-4 px-5 py-3.5">
                <span class="min-w-0 flex-1">
                  <span id="expire-label" class="block text-[14px]">Expire on a set date</span>
                  <span class="mt-0.5 block text-[13px] text-muted">Off means the mailbox never expires.</span>
                </span>
                @if (loaded()) {
                  <button
                    type="button"
                    role="switch"
                    aria-labelledby="expire-label"
                    [attr.aria-checked]="enabled()"
                    [class]="switchClass + (enabled() ? ' bg-accent' : ' bg-line')"
                    (click)="enabled.set(!enabled()); save.reset()"
                  >
                    <span class="size-5 rounded-full bg-white shadow-sm transition-transform" [class]="enabled() ? 'translate-x-[18px]' : 'translate-x-0.5'"></span>
                  </button>
                } @else {
                  <span class="h-6 w-10 flex-none animate-pulse rounded-full bg-bg" aria-hidden="true"></span>
                }
              </li>
              @if (enabled()) {
                <li class="px-5 py-4">
                  <label for="expires-at" class="block text-[14px]">Expiration date</label>
                  <input
                    id="expires-at"
                    type="date"
                    required
                    class="mt-2 h-11 w-full max-w-64 rounded-md border border-line bg-surface px-3.5 text-[15px] tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                    [value]="expiresAt()"
                    (input)="expiresAt.set($any($event.target).value); save.reset()"
                  />
                </li>
                <li class="flex items-center gap-4 px-5 py-3.5">
                  <span class="min-w-0 flex-1">
                    <span id="erase-label" class="block text-[14px]">Permanently erase its data on expiry</span>
                    <span class="mt-0.5 block text-[13px] text-muted">Instead of only suspending it.</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-labelledby="erase-label"
                    [attr.aria-checked]="remove()"
                    [class]="switchClass + (remove() ? ' bg-accent' : ' bg-line')"
                    (click)="remove.set(!remove()); save.reset()"
                  >
                    <span class="size-5 rounded-full bg-white shadow-sm transition-transform" [class]="remove() ? 'translate-x-[18px]' : 'translate-x-0.5'"></span>
                  </button>
                </li>
              }
            </ul>
            @if (enabled() && remove()) {
              <p class="flex gap-2.5 border-t border-line bg-bad/10 px-5 py-3 text-[13px] leading-relaxed text-bad" role="alert">
                <amelu-icon name="circleAlert" [size]="16" class="mt-0.5 flex-none" />
                <span>
                  <span class="font-medium">The data will be gone for good.</span>
                  On the expiration date, the mailbox and all its messages are erased. There is no way to recover them.
                </span>
              </p>
            }
            <div class="flex items-center gap-3 border-t border-line px-5 py-3">
              <button type="submit" [class]="ui.primary + ' h-9'" [disabled]="save.busy() || !changed()">
                {{ save.busy() ? 'Saving...' : 'Save changes' }}
              </button>
              @if (changed()) {
                <span class="text-[13px] text-muted">Unsaved changes</span>
              }
            </div>
          </section>
        }
      </form>

      <aside class="space-y-5">
        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Saved setting</h2>
          </div>
          <div [class]="ui.well">
            <dl class="space-y-1.5 rounded border border-line bg-surface px-3.5 py-3 text-[13px]">
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-muted">Expires</dt>
                <dd class="text-right font-medium">
                  @if (current(); as c) {
                    {{ c.date ?? 'Never' }}
                    @if (c.relative) {
                      <span class="block text-[12px] font-normal text-muted">{{ c.relative }}</span>
                    }
                  } @else {
                    <span class="inline-block h-3.5 w-16 animate-pulse rounded bg-bg align-middle"></span>
                  }
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-muted">On expiry</dt>
                <dd class="font-medium">
                  @if (current(); as c) {
                    <span [class.text-bad]="c.date && c.erase">{{ !c.date ? 'Nothing happens' : c.erase ? 'Erased' : 'Suspended' }}</span>
                  } @else {
                    <span class="inline-block h-3.5 w-16 animate-pulse rounded bg-bg align-middle"></span>
                  }
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Not to the minute</h2>
          </div>
          <div [class]="ui.well">
            <p class="text-[13px] leading-relaxed text-muted">
              Expirations are checked roughly every 15 minutes, not at the exact moment of expiry.
            </p>
          </div>
        </section>

        <section [class]="ui.panel">
          <div [class]="ui.panelHeader">
            <h2 [class]="ui.panelTitle">Good for</h2>
          </div>
          <div [class]="ui.well">
            <ul class="space-y-2 text-[13px] leading-relaxed text-muted">
              <li class="flex gap-2.5">
                <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
                Event or campaign addresses that are only needed for a while.
              </li>
              <li class="flex gap-2.5">
                <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
                Temporary staff, suspended on their last day.
              </li>
            </ul>
          </div>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MailboxExpiration {
  private readonly api = inject(MailboxApi);
  protected readonly ctx = inject(MailboxContext);
  protected readonly ui = UI;
  protected readonly badge = { neutral: badgeClass('neutral'), warn: badgeClass('warn'), bad: badgeClass('bad') };
  protected readonly switchClass =
    'relative inline-flex h-6 w-10 flex-none cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none';

  protected readonly loaded = perMailbox((id) => this.api.expiration(id));
  protected readonly enabled = linkedSignal(() => this.loaded()?.expiresAt != null);
  protected readonly expiresAt = linkedSignal(() => this.loaded()?.expiresAt ?? '');
  protected readonly remove = linkedSignal(() => this.loaded()?.removeUponExpiration ?? false);

  private readonly form = computed<Expiration>(() => ({
    expiresAt: this.enabled() ? this.expiresAt() : null,
    removeUponExpiration: this.remove(),
  }));
  protected readonly changed = computed(() => {
    const loaded = this.loaded();
    const form = this.form();
    return !!loaded && (loaded.expiresAt !== form.expiresAt || loaded.removeUponExpiration !== form.removeUponExpiration);
  });
  protected readonly save = new Saving();

  /** The saved setting, for the summary and the header badge. */
  protected readonly current = computed(() => {
    const loaded = this.loaded();
    if (!loaded) return undefined;
    if (!loaded.expiresAt) return { date: null, relative: null, erase: loaded.removeUponExpiration };
    const [y, m, d] = loaded.expiresAt.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
    return {
      date: day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      relative: days > 1 ? `In ${days} days` : days === 1 ? 'Tomorrow' : days === 0 ? 'Today' : 'Date has passed',
      erase: loaded.removeUponExpiration,
    };
  });

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const result = await this.save.run(this.api.updateExpiration(this.ctx.id(), this.form()), 'Could not save expiration');
    if (result) this.loaded.set(result);
  }
}
