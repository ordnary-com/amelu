import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { Alert } from '../../alert/alert';
import { EmptyState } from '../../empty-state/empty-state';
import { Icon } from '../../icon';
import { DitherShader } from '../../login/dither-shader';
import { UI } from '../../ui';
import { MailboxApi, MailboxExpiration as Expiration } from '../mailbox-api';
import { MailboxContext, perMailbox } from '../mailbox-context';
import { MailboxHeading } from '../shared/heading';
import { SaveFeedback, Saving } from '../shared/saving';
import { SwitchRow } from '../shared/switch-row';

/** The current dashboard's MailboxExpirationPage: suspend or erase the mailbox on a set date. */
@Component({
  selector: 'amelu-mailbox-expiration',
  imports: [Alert, DitherShader, EmptyState, Icon, MailboxHeading, SaveFeedback, SwitchRow],
  template: `
    <amelu-mailbox-heading title="Mailbox expiration">
      Mailboxes can expire on a specific future date. Use expirations to make temporary addresses. If you choose to
      remove them upon expiry, their data will be permanently erased. Otherwise the mailbox is just suspended.
    </amelu-mailbox-heading>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      @if (loaded() === null) {
        <amelu-empty-state [class]="ui.card" title="The expiration couldn't be loaded" [error]="true" />
      } @else {
        <form class="min-w-0 space-y-6" (submit)="submit($event)">
          <amelu-save-feedback [state]="save" />

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="rounded-lg border border-line bg-surface px-4 pt-3 pb-3.5">
              <span class="block text-[12px] text-muted">Expires</span>
              @if (current(); as c) {
                <span class="mt-1 block text-[26px] leading-tight font-normal tracking-[-0.01em]">{{ c.date ?? 'Never' }}</span>
                @if (c.relative) {
                  <span class="mt-0.5 block text-[12px] text-muted">{{ c.relative }}</span>
                }
              } @else {
                <span class="mt-2.5 block h-6 w-28 animate-pulse rounded bg-bg"></span>
              }
            </div>
            <div class="rounded-lg border border-line bg-surface px-4 pt-3 pb-3.5">
              <span class="block text-[12px] text-muted">On expiry</span>
              @if (current(); as c) {
                <span class="mt-1 block text-[26px] leading-tight font-normal tracking-[-0.01em]" [class.text-bad]="c.date && c.erase">
                  {{ !c.date ? 'Nothing happens' : c.erase ? 'Erased' : 'Suspended' }}
                </span>
              } @else {
                <span class="mt-2.5 block h-6 w-24 animate-pulse rounded bg-bg"></span>
              }
            </div>
          </div>

          <section>
            <h2 [class]="ui.sectionTitle">Expiration</h2>
            <div [class]="ui.card + ' overflow-hidden'">
              <div class="divide-y divide-line">
                <amelu-switch-row
                  label="Expire mailbox on a given date"
                  [disabled]="!loaded()"
                  [checked]="enabled()"
                  (checkedChange)="enabled.set($event); save.reset()"
                >
                  Off means the mailbox never expires.
                </amelu-switch-row>
                @if (enabled()) {
                  <label class="block px-4 py-3">
                    <span [class]="ui.label">Expiration date</span>
                    <input
                      type="date"
                      required
                      [class]="ui.input + ' max-w-56'"
                      [disabled]="!loaded()"
                      [value]="expiresAt()"
                      (input)="expiresAt.set($any($event.target).value); save.reset()"
                    />
                  </label>
                  <amelu-switch-row
                    label="Permanently erase this mailbox's data upon expiry"
                    [disabled]="!loaded()"
                    [checked]="remove()"
                    (checkedChange)="remove.set($event); save.reset()"
                  >
                    Instead of just suspending it.
                  </amelu-switch-row>
                }
              </div>
              @if (enabled() && remove()) {
                <div class="border-t border-line p-4">
                  <amelu-alert kind="warning" title="The data will be gone for good">
                    On the expiration date, the mailbox and all its messages are erased. There is no way to recover them.
                  </amelu-alert>
                </div>
              }
              <div class="flex items-center justify-end gap-3 border-t border-line bg-bg/40 px-4 py-3">
                @if (changed()) {
                  <span class="mr-auto text-[12px] text-muted">Unsaved changes</span>
                }
                <button type="submit" [class]="ui.primary" [disabled]="save.busy() || !changed()">
                  {{ save.busy() ? 'Saving...' : 'Save changes' }}
                </button>
              </div>
            </div>
          </section>
        </form>
      }

      <aside class="space-y-6">
        <section class="relative overflow-hidden rounded-lg border border-line bg-surface p-4 *:relative">
          <div class="pointer-events-none !absolute inset-0 opacity-30 [mask-image:linear-gradient(to_top_left,black,rgba(0,0,0,0.45)_40%,transparent_80%)]" aria-hidden="true">
            <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="var(--accent)" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
          </div>
          <amelu-icon name="clock" [size]="20" class="block text-ink" />
          <h2 class="mt-3 text-[14px] font-bold">Not to the minute</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Checked roughly every 15 minutes, not instantly at the exact moment of expiry.
          </p>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Good for</h2>
          <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              Event or campaign addresses that are only needed for a while.
            </li>
            <li class="flex gap-2.5">
              <span class="mt-[7px] size-1.5 flex-none rounded-full bg-muted/60"></span>
              Temporary staff, suspended on their last day.
            </li>
          </ul>
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

  /** The saved setting, for the stat tiles. */
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
